import { bindingNames, isFunction, ts, unwrap } from "./ast.mts";

export type Assignment = { target: ts.Node; value?: ts.Node; node: ts.Node };
type Scope = { parent?: Scope; node: ts.Node; names: Set<string> };

function functionScope(node: ts.Node): boolean {
	return (
		ts.isSourceFile(node) ||
		isFunction(node) ||
		ts.isClassStaticBlockDeclaration(node)
	);
}

function createsScope(node: ts.Node): boolean {
	return (
		functionScope(node) ||
		ts.isBlock(node) ||
		ts.isCatchClause(node) ||
		ts.isForStatement(node) ||
		ts.isForOfStatement(node) ||
		ts.isForInStatement(node) ||
		ts.isCaseBlock(node) ||
		ts.isClassExpression(node) ||
		ts.isClassDeclaration(node)
	);
}

// Destructuring writes invalidate aliases just like direct assignments
function writtenNames(node: ts.Node | undefined): string[] {
	if (!node) return [];
	node = unwrap(node);
	if (ts.isIdentifier(node)) return [node.text];
	if (ts.isBindingElement(node) || ts.isShorthandPropertyAssignment(node))
		return writtenNames(node.name);
	if (
		ts.isObjectBindingPattern(node) ||
		ts.isArrayBindingPattern(node) ||
		ts.isArrayLiteralExpression(node)
	)
		return node.elements.flatMap(writtenNames);
	if (ts.isObjectLiteralExpression(node))
		return node.properties.flatMap(writtenNames);
	if (ts.isPropertyAssignment(node)) return writtenNames(node.initializer);
	if (ts.isSpreadAssignment(node) || ts.isSpreadElement(node))
		return writtenNames(node.expression);
	if (
		ts.isBinaryExpression(node) &&
		node.operatorToken.kind === ts.SyntaxKind.EqualsToken
	)
		return writtenNames(node.left);
	return [];
}

// Index bindings before resolving uses, including hoisted declarations
export class SourceBindings {
	readonly assignments: Assignment[] = [];
	readonly objects: ts.ObjectLiteralExpression[] = [];
	readonly calls: (ts.CallExpression | ts.NewExpression)[] = [];
	private readonly contexts = new Map<ts.Node, Scope>();
	private readonly values = new Map<
		Scope,
		Map<string, (ts.Node | undefined)[]>
	>();

	constructor(source: ts.SourceFile) {
		const bind = (scope: Scope | undefined, node: ts.Node | undefined) => {
			for (const name of bindingNames(node)) scope?.names.add(name);
		};
		const visit = (node: ts.Node, parent?: Scope) => {
			const scope: Scope = createsScope(node)
				? { ...(parent ? { parent } : {}), node, names: new Set() }
				: (parent as Scope);
			this.contexts.set(node, scope);
			if (isFunction(node)) {
				for (const parameter of node.parameters) bind(scope, parameter);
				if (ts.isFunctionDeclaration(node) && node.name) {
					bind(parent, node.name);
					this.assignments.push({
						target: node.name,
						value: node,
						node: node.name,
					});
				} else if (ts.isFunctionExpression(node)) bind(scope, node.name);
			}
			if (ts.isClassDeclaration(node)) bind(parent, node.name);
			if (ts.isClassExpression(node)) bind(scope, node.name);
			if (ts.isCatchClause(node)) bind(scope, node.variableDeclaration?.name);
			if (ts.isVariableDeclarationList(node)) {
				let owner = scope;
				if (!(node.flags & ts.NodeFlags.BlockScoped))
					while (owner.parent && !functionScope(owner.node))
						owner = owner.parent;
				for (const declaration of node.declarations) {
					bind(owner, declaration.name);
					if (declaration.initializer)
						this.assignments.push({
							target: declaration.name,
							value: declaration.initializer,
							node,
						});
				}
			}
			if (ts.isImportClause(node)) bind(scope, node.name);
			if (ts.isImportSpecifier(node) || ts.isNamespaceImport(node))
				bind(scope, node.name);
			if (
				ts.isBinaryExpression(node) &&
				node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
				node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
			) {
				this.assignments.push({
					target: node.left,
					node,
					...(node.operatorToken.kind === ts.SyntaxKind.EqualsToken
						? { value: node.right }
						: {}),
				});
			}
			if (
				(ts.isPrefixUnaryExpression(node) ||
					ts.isPostfixUnaryExpression(node)) &&
				(node.operator === ts.SyntaxKind.PlusPlusToken ||
					node.operator === ts.SyntaxKind.MinusMinusToken)
			)
				this.assignments.push({ target: node.operand, node });
			if (ts.isForOfStatement(node) || ts.isForInStatement(node)) {
				const targets = ts.isVariableDeclarationList(node.initializer)
					? node.initializer.declarations.map((declaration) => declaration.name)
					: [node.initializer];
				for (const target of targets) this.assignments.push({ target, node });
			}
			if (ts.isObjectLiteralExpression(node)) this.objects.push(node);
			if (ts.isCallExpression(node) || ts.isNewExpression(node))
				this.calls.push(node);
			node.forEachChild((child) => {
				visit(child, scope);
			});
		};
		visit(source);
		for (const assignment of this.assignments) {
			const target = unwrap(assignment.target);
			for (const name of writtenNames(target)) {
				const owner = this.scope(name, assignment.node);
				if (!owner) continue;
				const values = this.values.get(owner) ?? new Map();
				const candidates = values.get(name) ?? [];
				candidates.push(ts.isIdentifier(target) ? assignment.value : undefined);
				values.set(name, candidates);
				this.values.set(owner, values);
			}
		}
	}

	private scope(name: string, node: ts.Node): Scope | undefined {
		let scope = this.contexts.get(node);
		while (scope && !scope.names.has(name)) scope = scope.parent;
		return scope;
	}

	owner(name: string, node: ts.Node): ts.Node | undefined {
		return this.scope(name, node)?.node;
	}

	functionOwner(node: ts.Node): ts.Node | undefined {
		let scope = this.contexts.get(node);
		while (scope && !functionScope(scope.node)) scope = scope.parent;
		return scope?.node;
	}

	candidates(node: ts.Identifier): readonly (ts.Node | undefined)[] {
		const owner = this.scope(node.text, node);
		return (owner && this.values.get(owner)?.get(node.text)) ?? [];
	}

	// Multiple writes and recursive factories remain unresolved, never guessed
	dereference(node: ts.Node, seen = new Set<ts.Node>()): ts.Node | undefined {
		node = unwrap(node);
		if (seen.has(node)) return undefined;
		seen.add(node);
		if (
			ts.isBinaryExpression(node) &&
			node.operatorToken.kind === ts.SyntaxKind.CommaToken
		)
			return this.dereference(node.right, seen);
		if (ts.isIdentifier(node)) {
			const candidates = this.candidates(node);
			return candidates.length === 1 && candidates[0]
				? this.dereference(candidates[0], seen)
				: undefined;
		}
		if (ts.isCallExpression(node)) {
			const factory = this.dereference(node.expression, new Set(seen));
			if (!isFunction(factory) || !factory.body) return undefined;
			if (!ts.isBlock(factory.body))
				return this.dereference(factory.body, seen);
			if (factory.body.statements.length === 1) {
				const statement = factory.body.statements[0];
				if (
					ts.isReturnStatement(statement) &&
					statement.expression &&
					ts.isIdentifier(statement.expression)
				) {
					const name = statement.expression.text;
					const parameter = factory.parameters.findIndex(
						(p) => ts.isIdentifier(p.name) && p.name.text === name,
					);
					const argument = node.arguments[parameter];
					if (argument && !ts.isSpreadElement(argument))
						return this.dereference(argument, seen);
				}
			}
			const returns = factory.body.statements.filter(ts.isReturnStatement);
			return returns.length === 1 && returns[0].expression
				? this.dereference(returns[0].expression, seen)
				: undefined;
		}
		return node;
	}
}
