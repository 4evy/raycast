import path from "node:path";
import * as ts from "typescript/ast";
import { createFileSystem } from "typescript/fs";
import { API, type Program } from "typescript/sync";

export { ts };

// Isolate the native compiler API and never execute input
export class SourceParser implements Disposable {
	private readonly api: API;
	private readonly program: Program;
	private readonly root = path.resolve(".cache/raycast-analysis");

	constructor(sources: ReadonlyMap<string, string>) {
		const config = path.join(this.root, "tsconfig.json");
		const files = Array.from(sources, ([file, text]): [string, string] => [
			path.join(this.root, file),
			text,
		]);
		files.push([
			config,
			JSON.stringify({
				compilerOptions: { allowJs: true, noResolve: true, noLib: true },
				files: [...sources.keys()],
			}),
		]);
		this.api = new API({ cwd: this.root });
		try {
			const snapshot = this.api.createSnapshot({
				openProjects: [config],
				fileSystem: createFileSystem(files),
			});
			const project = snapshot.getConfiguredProject(config);
			if (!project)
				throw new Error("TypeScript did not load the source project");
			this.program = project.program;
		} catch (error) {
			this.api.close();
			throw error;
		}
	}

	parse(file: string): ts.SourceFile {
		const name = path.join(this.root, file);
		const source = this.program.getSourceFile(name);
		if (!source)
			throw new Error(`Source is not in the analysis project: ${file}`);
		const diagnostics = this.program.getSyntacticDiagnostics(name);
		if (diagnostics.length) {
			throw new Error(`${file}: ${JSON.stringify(diagnostics)}`);
		}
		return source;
	}

	[Symbol.dispose](): void {
		this.api.close();
	}
}

export type FunctionNode =
	| ts.FunctionDeclaration
	| ts.FunctionExpression
	| ts.ArrowFunction
	| ts.MethodDeclaration
	| ts.GetAccessorDeclaration
	| ts.SetAccessorDeclaration;

export function isFunction(node: ts.Node | undefined): node is FunctionNode {
	return (
		!!node &&
		ts.isFunctionLikeDeclaration(node) &&
		!ts.isConstructorDeclaration(node)
	);
}

export function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
	node.forEachChild((child) => {
		walk(child, visit);
	});
	visit(node);
}

export function unwrap(node: ts.Node): ts.Node {
	while (
		ts.isParenthesizedExpression(node) ||
		ts.isAwaitExpression(node) ||
		ts.isAsExpression(node) ||
		ts.isNonNullExpression(node) ||
		ts.isSatisfiesExpression(node)
	)
		node = node.expression;
	return node;
}

export function literal(node: ts.Node | undefined): string | undefined {
	return node && ts.isStringLiteralLikeNode(node) ? node.text : undefined;
}

export function property(node: ts.Node | undefined): string | undefined {
	if (!node) return undefined;
	if (ts.isComputedPropertyName(node)) return literal(unwrap(node.expression));
	return ts.isIdentifier(node) ? node.text : literal(node);
}

export function bindingNames(node: ts.Node | undefined): string[] {
	if (!node) return [];
	if (ts.isIdentifier(node)) return [node.text];
	if (ts.isBindingElement(node) || ts.isParameterDeclaration(node))
		return bindingNames(node.name);
	if (ts.isBindingPattern(node)) return node.elements.flatMap(bindingNames);
	return [];
}
