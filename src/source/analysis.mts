import { isFunction, literal, property, ts, unwrap, walk } from "./ast.mts";
import { SourceBindings } from "./bindings.mts";
import {
	type BuiltinCommand,
	type BuiltinExpression,
	type BuiltinExtension,
	emptyAnalysis,
	type SourceAnalysis,
} from "./model.mts";

export function analyzeSource(
	ast: ts.SourceFile,
	file: string,
): SourceAnalysis {
	const index = new SourceBindings(ast);
	const result = emptyAnalysis();
	const text = (node: ts.Node) => node.getText(ast);
	const line = (node: ts.Node) =>
		ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
	const owner = (name: string, node: ts.Node) => index.owner(name, node);
	const dereference = (node: ts.Node) => index.dereference(node);
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
	const builtinEntries = (node: ts.Node | undefined, label: string) =>
		objectEntries(node, label, result.unresolvedBuiltins);
	const hasKeys = (node: ts.ObjectLiteralExpression, keys: string[]) =>
		keys.every((key) =>
			node.properties.some(
				(p) => !ts.isSpreadAssignment(p) && p.name && property(p.name) === key,
			),
		);
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
					const field = receiver.properties.findLast(
						(p) =>
							ts.isPropertyAssignment(p) && property(p.name) === node.name.text,
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
						const argument = definition.arguments[i];
						// A spread can shift every subsequent argument's position
						if (argument && ts.isSpreadElement(argument)) break;
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
						fields.entries().map(([key, field]) => [key, expression(field)]),
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
				entries(node, `${id}.settings.${section}`)
					.entries()
					.map(([key, value]) => [key, expression(value)]),
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

	result.unresolvedBuiltins = [...new Set(result.unresolvedBuiltins)];
	return result;
}
