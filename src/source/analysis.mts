import {
	bindingNames,
	type FunctionNode,
	isFunction,
	literal,
	member,
	property,
	ts,
	unwrap,
	walk,
} from "./ast.mts";
import { SourceBindings } from "./bindings.mts";
import {
	type BuiltinCommand,
	type BuiltinExpression,
	type BuiltinExtension,
	type CallEvidence,
	emptyAnalysis,
	type FunctionEvidence,
	type SourceAnalysis,
} from "./model.mts";

type Call = ts.CallExpression | ts.NewExpression;

export function analyzeSource(
	ast: ts.SourceFile,
	file: string,
	nativeMethods: ReadonlySet<string>,
): SourceAnalysis {
	const index = new SourceBindings(ast);
	const result = emptyAnalysis();
	const text = (node: ts.Node) => node.getText(ast);
	const line = (node: ts.Node) =>
		ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
	const owner = (name: string, node: ts.Node) => index.owner(name, node);
	const dereference = (node: ts.Node) => index.dereference(node);
	const args = (node: Call) => node.arguments ?? [];
	const aliases = new Map<ts.Node, Map<string, string>>();
	const setAlias = (
		name: ts.Identifier,
		context: ts.Node,
		value: string,
	): boolean => {
		const scope = owner(name.text, context);
		const assignedValues = index.candidates(name).filter((candidate) => {
			const value = candidate && unwrap(candidate);
			return (
				!value ||
				!(
					ts.isVoidExpression(value) &&
					ts.isNumericLiteral(value.expression) &&
					value.expression.text === "0"
				)
			);
		});
		if (!scope || assignedValues.length > 1) return false;
		const values = aliases.get(scope) ?? new Map<string, string>();
		if (values.has(name.text)) return false;
		values.set(name.text, value);
		aliases.set(scope, values);
		return true;
	};
	const resolve = (node: ts.Node): string | undefined => {
		const target = member(node);
		if (!ts.isIdentifier(target.root)) return undefined;
		const scope = owner(target.root.text, node);
		const base = scope && aliases.get(scope)?.get(target.root.text);
		return base === undefined
			? undefined
			: [base, ...target.path].filter(Boolean).join(".");
	};
	const nativeCall = (call: Call) => {
		const resolved = resolve(call.expression);
		return resolved && nativeMethods.has(resolved.split(".").at(-1) ?? "")
			? resolved
			: undefined;
	};
	function evidence(call: Call): CallEvidence {
		return {
			file,
			line: line(call),
			callee: text(call.expression),
			arguments: args(call).map(text),
			argumentKinds: args(call).map((arg) => ts.formatSyntaxKind(arg.kind)),
			objectKeys: args(call).map((arg) =>
				ts.isObjectLiteralExpression(arg)
					? arg.properties.flatMap((p) =>
							!ts.isSpreadAssignment(p) &&
							p.name &&
							property(p.name) !== undefined
								? [property(p.name) as string]
								: [],
						)
					: [],
			),
		};
	}
	for (const assignment of index.assignments) {
		const value = assignment.value && unwrap(assignment.value);
		if (
			ts.isIdentifier(assignment.target) &&
			value &&
			ts.isNewExpression(value) &&
			member(value.expression).path.at(-1) === "DatabaseClient"
		) {
			setAlias(assignment.target, assignment.node, "");
			result.constructors.push(evidence(value));
		}
	}
	let changed = true;
	while (changed) {
		changed = false;
		for (const assignment of index.assignments) {
			const resolved = assignment.value && resolve(assignment.value);
			if (resolved === undefined) continue;
			if (ts.isIdentifier(assignment.target))
				changed =
					setAlias(assignment.target, assignment.node, resolved) || changed;
			if (ts.isObjectBindingPattern(assignment.target)) {
				for (const element of assignment.target.elements) {
					if (
						element.dotDotDotToken ||
						element.initializer ||
						!element.name ||
						!ts.isIdentifier(element.name)
					)
						continue;
					const key = property(element.propertyName ?? element.name);
					if (key !== undefined)
						changed =
							setAlias(
								element.name,
								assignment.node,
								[resolved, key].filter(Boolean).join("."),
							) || changed;
				}
			}
		}
	}
	for (const call of index.calls) {
		if (!ts.isCallExpression(call)) continue;
		const resolved = nativeCall(call);
		if (resolved) {
			result.calls[resolved] ??= [];
			result.calls[resolved].push(evidence(call));
		} else if (nativeMethods.has(member(call.expression).path.at(-1) ?? ""))
			result.unresolved.push(evidence(call));
	}

	function objectEntries(
		node: ts.Node | undefined,
		label: string,
		unresolved: string[],
		seen = new Set<ts.Node>(),
		resolveNode = dereference,
	): Map<string, ts.Node> {
		if (!node) return new Map();
		const resolved = resolveNode(node);
		if (
			!resolved ||
			!ts.isObjectLiteralExpression(resolved) ||
			seen.has(resolved)
		) {
			unresolved.push(`${label}: ${text(node)}`);
			return new Map();
		}
		seen.add(resolved);
		const entries = new Map<string, ts.Node>();
		for (const p of resolved.properties) {
			if (ts.isSpreadAssignment(p)) {
				for (const [key, value] of objectEntries(
					p.expression,
					label,
					unresolved,
					new Set(seen),
					resolveNode,
				))
					entries.set(key, value);
				continue;
			}
			const key = property(p.name);
			if (key === undefined) {
				unresolved.push(`${label}: dynamic property at ${line(p)}`);
				continue;
			}
			if (ts.isPropertyAssignment(p)) entries.set(key, p.initializer);
			else if (ts.isShorthandPropertyAssignment(p)) entries.set(key, p.name);
			else entries.set(key, p);
		}
		return entries;
	}
	const handlerEntries = (node: ts.Node, label: string) =>
		objectEntries(node, label, result.unresolvedHandlers);
	const builtinEntries = (node: ts.Node | undefined, label: string) =>
		objectEntries(node, label, result.unresolvedBuiltins);
	const hasKeys = (node: ts.ObjectLiteralExpression, keys: string[]) =>
		keys.every((key) =>
			node.properties.some(
				(p) => !ts.isSpreadAssignment(p) && p.name && property(p.name) === key,
			),
		);
	const registries = index.assignments.filter(
		(a) =>
			a.value &&
			ts.isObjectLiteralExpression(a.value) &&
			hasKeys(a.value, ["database", "settings", "extensionHost", "rootSearch"]),
	);
	const extensions = index.objects.filter((object) =>
		object.properties.some(
			(p) =>
				ts.isSpreadAssignment(p) &&
				ts.isIdentifier(p.expression) &&
				registries.some(
					(r) =>
						ts.isIdentifier(r.target) &&
						ts.isIdentifier(p.expression) &&
						r.target.text === p.expression.text &&
						owner(r.target.text, r.node) ===
							owner(p.expression.text, p.expression),
				),
		),
	);
	const handlerFunctions = new Map<string, FunctionNode>();
	for (const object of [
		...registries.flatMap((r) => (r.value ? [r.value] : [])),
		...extensions,
	]) {
		for (const [namespace, expression] of handlerEntries(object, "dispatch")) {
			for (const [method, expr] of handlerEntries(expression, namespace)) {
				const fn = dereference(expr);
				const key = `${namespace}.${method}`;
				const handler = {
					implementationResolved: isFunction(fn) && !!fn.body,
					hostCalls: [] as string[],
					notifications: [] as string[],
					events: [] as string[],
					file,
					line: line(fn ?? expr),
					parameters: [] as string[],
					inputProperties: [] as string[],
					nativeCalls: [] as string[],
				};
				result.handlers[key] = handler;
				if (!isFunction(fn) || !fn.body) {
					result.unresolvedHandlers.push(`${key}: ${text(expr)}`);
					continue;
				}
				handlerFunctions.set(key, fn);
				handler.parameters = fn.parameters.map(text);
				const inputs = new Set<string>();
				const parameter = fn.parameters[0];
				const names = bindingNames(parameter);
				const addBindingKeys = (pattern: ts.ObjectBindingPattern) => {
					for (const element of pattern.elements) {
						if (element.dotDotDotToken) continue;
						const key = property(element.propertyName ?? element.name);
						if (key !== undefined) inputs.add(key);
					}
				};
				if (parameter && ts.isObjectBindingPattern(parameter.name))
					addBindingKeys(parameter.name);
				walk(fn, (node) => {
					if (
						ts.isVariableDeclaration(node) &&
						ts.isObjectBindingPattern(node.name) &&
						node.initializer &&
						ts.isIdentifier(node.initializer) &&
						names.includes(node.initializer.text) &&
						owner(node.initializer.text, node) === fn
					)
						addBindingKeys(node.name);
					if (
						!ts.isPropertyAccessExpression(node) &&
						!ts.isElementAccessExpression(node)
					)
						return;
					const target = member(node);
					// A destructured parameter's local names are values, not the payload
					if (
						parameter &&
						ts.isIdentifier(parameter.name) &&
						ts.isIdentifier(target.root) &&
						target.root.text === parameter.name.text &&
						owner(target.root.text, node) === fn &&
						target.path[0]
					)
						inputs.add(target.path[0]);
				});
				handler.inputProperties = [...inputs].sort();
			}
		}
	}

	const expression = (node: ts.Node): BuiltinExpression => ({
		line: line(node),
		expression: text(node),
	});
	const firstArgument = (node: ts.Node | undefined) =>
		node && ts.isCallExpression(node) ? node.arguments[0] : node;
	function commandDefinition(
		value: ts.Node,
		id: string,
		kind: "static" | "dynamic",
	): BuiltinCommand {
		const command: BuiltinCommand = {
			id,
			kind,
			line: line(value),
			definitionResolved: false,
			fields: {},
			settings: {},
			directActionHandlers: [],
		};
		const unresolvedBefore = result.unresolvedBuiltins.length;
		const parameterValues = new Map<string, ts.Node>();
		const omittedParameters = new Set<string>();
		let factoryScope: ts.Node | undefined;
		const unknownValue = Symbol("unknown static value");
		function staticValue(
			node: ts.Node,
			seen = new Set<ts.Node>(),
		): string | boolean | undefined | typeof unknownValue {
			node = unwrap(node);
			if (seen.has(node)) return unknownValue;
			seen.add(node);
			const value = literal(node);
			if (value !== undefined) return value;
			if (ts.isIdentifier(node) && owner(node.text, node) === factoryScope) {
				if (omittedParameters.has(node.text)) return undefined;
				const argument = parameterValues.get(node.text);
				if (argument) return staticValue(argument, seen);
			}
			if (ts.isPropertyAccessExpression(node)) {
				if (
					node.questionDotToken &&
					staticValue(node.expression, new Set(seen)) === undefined
				)
					return undefined;
				const receiver = resolveParameter(node.expression);
				// Only literal data properties establish a value without executing code
				if (
					receiver &&
					ts.isObjectLiteralExpression(receiver) &&
					receiver.properties.every(
						(p) =>
							ts.isPropertyAssignment(p) &&
							!ts.isComputedPropertyName(p.name) &&
							property(p.name) !== "__proto__",
					)
				) {
					const field = [...receiver.properties]
						.reverse()
						.find(
							(p) =>
								ts.isPropertyAssignment(p) &&
								property(p.name) === node.name.text,
						);
					if (field && ts.isPropertyAssignment(field))
						return staticValue(field.initializer, seen);
				}
			}
			if (
				ts.isBinaryExpression(node) &&
				(node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
					node.operatorToken.kind ===
						ts.SyntaxKind.ExclamationEqualsEqualsToken)
			) {
				const left = staticValue(node.left, new Set(seen));
				const right = staticValue(node.right, new Set(seen));
				if (left !== unknownValue && right !== unknownValue)
					return node.operatorToken.kind ===
						ts.SyntaxKind.EqualsEqualsEqualsToken
						? left === right
						: left !== right;
			}
			return unknownValue;
		}
		function resolveParameter(node: ts.Node): ts.Node | undefined {
			node = unwrap(node);
			if (ts.isConditionalExpression(node)) {
				const condition = staticValue(node.condition);
				if (typeof condition === "boolean")
					return resolveParameter(condition ? node.whenTrue : node.whenFalse);
			}
			if (ts.isIdentifier(node) && owner(node.text, node) === factoryScope) {
				const argument = parameterValues.get(node.text);
				if (argument) return dereference(argument);
			}
			return dereference(node);
		}
		const entries = (node: ts.Node | undefined, label: string) =>
			objectEntries(
				node,
				label,
				result.unresolvedBuiltins,
				new Set(),
				resolveParameter,
			);
		let actionNode: ts.Node | undefined;
		let definition = value;
		if (ts.isCallExpression(definition)) {
			const factory = dereference(definition.expression);
			if (
				factory &&
				isFunction(factory) &&
				factory.body &&
				ts.isBlock(factory.body) &&
				factory.body.statements.length === 1
			) {
				const statement = factory.body.statements[0];
				if (
					ts.isReturnStatement(statement) &&
					statement.expression &&
					ts.isCallExpression(statement.expression) &&
					ts.isPropertyAccessExpression(statement.expression.expression) &&
					statement.expression.expression.name.text === "actions"
				) {
					factoryScope = factory;
					for (const [i, parameter] of factory.parameters.entries()) {
						// A spread can shift every subsequent argument's position
						if (definition.arguments.slice(0, i + 1).some(ts.isSpreadElement))
							break;
						const argument = definition.arguments[i];
						if (
							ts.isIdentifier(parameter.name) &&
							!parameter.dotDotDotToken &&
							!parameter.initializer &&
							!argument
						)
							omittedParameters.add(parameter.name.text);
						if (
							ts.isIdentifier(parameter.name) &&
							!parameter.dotDotDotToken &&
							!parameter.initializer &&
							argument &&
							!ts.isSpreadElement(argument)
						)
							parameterValues.set(parameter.name.text, argument);
					}
					command.factory = {
						line: line(factory),
						parameters: factory.parameters.map(text),
						arguments: definition.arguments.map(expression),
					};
					definition = statement.expression;
				}
			}
		}
		if (
			ts.isCallExpression(definition) &&
			ts.isPropertyAccessExpression(definition.expression) &&
			definition.expression.name.text === "actions"
		) {
			if (definition.arguments[0]) {
				actionNode = definition.arguments[0];
				command.actions = expression(actionNode);
			}
			definition = definition.expression.expression;
		}
		if (
			ts.isCallExpression(definition) &&
			definition.arguments[0] &&
			ts.isObjectLiteralExpression(definition.arguments[0])
		)
			definition = definition.arguments[0];
		const resolved = dereference(definition);
		if (!resolved || !ts.isObjectLiteralExpression(resolved)) {
			command.definition = expression(value);
			result.unresolvedBuiltins.push(
				`${id}: command definition at ${command.line}`,
			);
			return command;
		}
		if (command.factory) command.definition = expression(resolved);
		const fields = entries(resolved, id);
		for (const [key, node] of fields) command.fields[key] = expression(node);
		const actions = fields.get("actions");
		if (actions) {
			actionNode = actions;
			command.actions = expression(actions);
		}
		if (actionNode)
			walk(actionNode, (node) => {
				if (!ts.isPropertyAssignment(node) || property(node.name) !== "handler")
					return;
				const unresolved: string[] = [];
				const fields = objectEntries(
					node.initializer,
					`${id}.actionHandler`,
					unresolved,
					new Set(),
					resolveParameter,
				);
				const values: Record<string, string> = {};
				for (const [key, field] of fields) {
					const value = literal(resolveParameter(field));
					if (value !== undefined) values[key] = value;
				}
				command.directActionHandlers.push({
					...expression(node.initializer),
					fields: Object.fromEntries(
						[...fields].map(([key, field]) => [key, expression(field)]),
					),
					values,
					unresolved,
				});
			});
		for (const [section, node] of entries(
			firstArgument(fields.get("settings")),
			`${id}.settings`,
		))
			command.settings[section] = Object.fromEntries(
				[...entries(node, `${id}.settings.${section}`)].map(([key, value]) => [
					key,
					expression(value),
				]),
			);
		command.definitionResolved =
			result.unresolvedBuiltins.length === unresolvedBefore;
		if (!command.definitionResolved) command.definition = expression(resolved);
		return command;
	}
	const builtinFactories = index.assignments.filter(
		(a) =>
			a.value &&
			ts.isFunctionDeclaration(a.value) &&
			a.value.body?.statements.some(
				(node) =>
					ts.isReturnStatement(node) &&
					node.expression &&
					ts.isObjectLiteralExpression(node.expression) &&
					hasKeys(node.expression, [
						"commandList",
						"dynamicCommandList",
						"settings",
						"id",
					]),
			),
	);
	for (const call of index.calls) {
		if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression))
			continue;
		const callee = call.expression;
		if (
			!builtinFactories.some(
				(f) =>
					ts.isIdentifier(f.target) &&
					f.target.text === callee.text &&
					owner(callee.text, call) === owner(f.target.text, f.node),
			)
		)
			continue;
		const fields = builtinEntries(call.arguments[0], "builtin extension");
		const key = literal(fields.get("key"));
		if (!key) {
			result.unresolvedBuiltins.push(
				`Extension without literal key at ${line(call)}`,
			);
			continue;
		}
		const extension: BuiltinExtension = {
			id: `e:r:${key}`,
			key,
			file,
			line: line(call),
			commands: {},
			preferences: {},
			state: {},
			config: {},
		};
		const title = literal(fields.get("title"));
		if (title) extension.title = title;
		for (const [field, kind, separator] of [
			["commands", "static", "::-::"],
			["dynamicCommands", "dynamic", "::*::"],
		] as const)
			for (const [name, value] of builtinEntries(
				fields.get(field),
				`${key}.${field}`,
			))
				extension.commands[name] = commandDefinition(
					value,
					`c:r:${key}${separator}${name}`,
					kind,
				);
		const settings = builtinEntries(
			firstArgument(fields.get("settings")),
			`${key}.settings`,
		);
		for (const section of ["preferences", "state"] as const) {
			for (const [name, value] of builtinEntries(
				settings.get(section),
				`${key}.${section}`,
			)) {
				const options = builtinEntries(
					firstArgument(value),
					`${key}.${section}.${name}`,
				);
				const entry: BuiltinExtension["preferences"][string] = {
					line: line(value),
				};
				const storage = literal(options.get("storage"));
				if (storage) entry.storage = storage;
				const defaultValue = options.get("default");
				if (defaultValue) entry.defaultExpression = text(defaultValue);
				extension[section][name] = entry;
			}
		}
		for (const [name, value] of builtinEntries(
			settings.get("config"),
			`${key}.config`,
		))
			extension.config[name] = expression(value);
		if (result.builtinExtensions[extension.id])
			throw new Error(`Duplicate built-in extension: ${extension.id}`);
		result.builtinExtensions[extension.id] = extension;
	}

	const callsByFunction = new Map<ts.Node, Call[]>();
	for (const call of index.calls) {
		const fn = index.functionOwner(call);
		if (fn) {
			const calls = callsByFunction.get(fn) ?? [];
			calls.push(call);
			callsByFunction.set(fn, calls);
		}
	}
	const graphNodes = new Map<string, FunctionNode>();
	const functionId = (fn: FunctionNode): string => {
		const id = `${file}:${line(fn)}:${fn.getStart(ast)}`;
		graphNodes.set(id, fn);
		return id;
	};
	function graphNode(id: string): FunctionEvidence {
		if (result.functionGraph[id]) return result.functionGraph[id];
		const fn = graphNodes.get(id);
		if (!fn) throw new Error(`Missing function graph node: ${id}`);
		const entry: FunctionEvidence = {
			file,
			line: line(fn),
			effects: [],
			calls: [],
			unresolvedCalls: [],
		};
		result.functionGraph[id] = entry;
		for (const call of callsByFunction.get(fn) ?? []) {
			const callLine = line(call);
			const callee = text(call.expression);
			let classified = false;
			const effect = (
				kind: FunctionEvidence["effects"][number]["kind"],
				name: string,
			) => {
				entry.effects.push({ kind, name, line: callLine });
				classified = true;
			};
			const resolved = ts.isCallExpression(call) && nativeCall(call);
			if (resolved) effect("native", resolved);
			const target = member(call.expression);
			if (
				ts.isIdentifier(target.root) &&
				owner(target.root.text, call) === ast
			) {
				if (target.path[0] === "host") effect("host", target.path.join("."));
				if (target.path.length === 2 && /^emit[A-Z]/.test(target.path[1]))
					effect("notification", target.path.join("."));
				const event = literal(args(call)[0]);
				if (target.path.at(-1) === "emit" && event) effect("event", event);
			}
			const helper = dereference(call.expression);
			if (isFunction(helper) && helper.body) {
				entry.calls.push({
					target: functionId(helper),
					line: callLine,
					callee,
					kind: "direct",
				});
				classified = true;
			}
			// Callback edges describe potential execution, including deferred callbacks
			for (const argument of args(call)) {
				const callback = dereference(argument);
				if (isFunction(callback) && callback.body)
					entry.calls.push({
						target: functionId(callback),
						line: callLine,
						callee,
						kind: "callback",
					});
			}
			if (!classified) entry.unresolvedCalls.push({ line: callLine, callee });
		}
		return entry;
	}
	for (const [name, fn] of handlerFunctions) {
		const root = functionId(fn);
		const pending = [root];
		const visited = new Set<string>();
		const found = {
			native: new Set<string>(),
			host: new Set<string>(),
			notification: new Set<string>(),
			event: new Set<string>(),
		};
		let unresolvedCalls = 0;
		for (let i = 0; i < pending.length; i++) {
			const id = pending[i];
			if (visited.has(id)) continue;
			visited.add(id);
			const entry = graphNode(id);
			unresolvedCalls += entry.unresolvedCalls.length;
			for (const effect of entry.effects) found[effect.kind].add(effect.name);
			for (const edge of entry.calls)
				if (!visited.has(edge.target)) pending.push(edge.target);
		}
		const handler = result.handlers[name];
		const own = graphNode(root).effects;
		const ownNames = (kind: FunctionEvidence["effects"][number]["kind"]) =>
			[
				...new Set(own.filter((e) => e.kind === kind).map((e) => e.name)),
			].sort();
		handler.nativeCalls = ownNames("native");
		handler.hostCalls = ownNames("host");
		handler.notifications = ownNames("notification");
		handler.events = ownNames("event");
		handler.effectTrace = {
			root,
			reachableFunctions: visited.size,
			unresolvedCalls,
			nativeCalls: [...found.native].sort(),
			hostCalls: [...found.host].sort(),
			notifications: [...found.notification].sort(),
			events: [...found.event].sort(),
		};
	}
	result.unresolvedHandlers = [...new Set(result.unresolvedHandlers)];
	result.unresolvedBuiltins = [...new Set(result.unresolvedBuiltins)];
	return result;
}
