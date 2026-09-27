import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import aiPolicy from "../data/disable-ai.json" with { type: "json" };
import { inspectNativeSurface } from "../src/native/surface.mts";
import { analyzeSource } from "../src/source/analysis.mts";
import { SourceParser, ts } from "../src/source/ast.mts";
import { openCorpus, readSources } from "../src/source/corpus.mts";
import { emptyAnalysis, mergeAnalysis } from "../src/source/model.mts";

const root = fileURLToPath(new URL("../", import.meta.url));
const corpus = await openCorpus();
const { generated, manifest } = corpus;
const native = await inspectNativeSurface();
if (!manifest.nativeAddons?.some((a) => a.sha256 === native.sha256))
	throw new Error(
		"Installed native addon does not match the extracted release; sync sources and use RAYCAST_DATA_ADDON for the matching binary",
	);
const methods = new Set(
	Object.values(native.exports).flatMap((e) => Object.keys(e.members)),
);
const analysis = emptyAnalysis();
const sources = await readSources(corpus);
const parser = new SourceParser(sources);
try {
	for (const file of sources.keys())
		mergeAnalysis(analysis, analyzeSource(parser.parse(file), file, methods));
} finally {
	parser[Symbol.dispose]();
}
const parsed = sources.size;
const contractFile = "src/native/backend.mts";
const contractSource = await readFile(path.join(root, contractFile), "utf8");
const reviewedContracts: Record<
	string,
	{ status: "reviewed"; file: string; line: number; signature: string }
> = {};
{
	using contractParser = new SourceParser(
		new Map([[contractFile, contractSource]]),
	);
	const ast = contractParser.parse(contractFile);
	const declaration = ast.statements.find(
		(node) =>
			ts.isTypeAliasDeclaration(node) &&
			node.name.text === "ReviewedBackendContracts",
	);
	if (
		!declaration ||
		!ts.isTypeAliasDeclaration(declaration) ||
		!ts.isTypeLiteralNode(declaration.type)
	)
		throw new Error("ReviewedBackendContracts must be a type literal");
	for (const member of declaration.type.members) {
		if (
			!ts.isPropertySignatureDeclaration(member) ||
			!ts.isStringLiteral(member.name) ||
			!member.type
		)
			throw new Error("Expected a named reviewed backend signature");
		const name = member.name.text;
		if (!analysis.handlers[name])
			throw new Error(`Reviewed backend handler is missing: ${name}`);
		if (reviewedContracts[name])
			throw new Error(`Duplicate reviewed backend handler: ${name}`);
		reviewedContracts[name] = {
			status: "reviewed",
			file: contractFile,
			line: ast.getLineAndCharacterOfPosition(member.getStart(ast)).line + 1,
			signature: member.type.getText(ast),
		};
	}
}
const backendHandlers = Object.fromEntries(
	Object.entries(analysis.handlers).map(([name, handler]) => [
		name,
		{
			...handler,
			contract: reviewedContracts[name] ?? {
				status: "unreviewed",
				signature: "(input?: unknown) => Promise<unknown>",
			},
		},
	]),
);

if (analysis.constructors.length === 0)
	throw new Error("No DatabaseClient constructor found in extracted sources");
if (Object.keys(analysis.builtinExtensions).length === 0)
	throw new Error("No built-in extensions found in extracted sources");
for (const rule of aiPolicy.internalExtensions) {
	const extension = analysis.builtinExtensions[rule.id];
	if (!extension) throw new Error(`AI policy extension missing: ${rule.id}`);
	for (const [field, storage] of [
		["syncedMeta", "synced"],
		["localMeta", "local"],
	] as const) {
		for (const key of Object.keys(rule[field] ?? {})) {
			if (extension.preferences[key]?.storage !== storage)
				throw new Error(
					`AI policy preference storage changed: ${rule.id}.${key}; expected ${storage}`,
				);
		}
	}
}
const builtinCommandIds = new Set(
	Object.values(analysis.builtinExtensions).flatMap((extension) =>
		Object.values(extension.commands).map((command) => command.id),
	),
);
for (const id of aiPolicy.fallbackCommandIds) {
	if (!builtinCommandIds.has(id))
		throw new Error(`AI policy command missing: ${id}`);
}
const classes = Object.entries(native.exports).filter(
	([, e]) => e.kind === "class",
);
const repositories = Object.fromEntries(
	classes
		.filter(([n]) => n.endsWith("Repository"))
		.map(([n]) => [n[0].toLowerCase() + n.slice(1, -"Repository".length), n]),
);
const client = native.exports.DatabaseClient;
for (const repository of Object.keys(repositories)) {
	if (client?.members[repository]?.kind !== "getter")
		throw new Error(`Repository has no DatabaseClient getter: ${repository}`);
}
const methodPaths = Object.entries(client.members).flatMap(([name, m]) =>
	m.kind === "method"
		? [name]
		: repositories[name]
			? Object.keys(native.exports[repositories[name]].members).map(
					(method) => `${name}.${method}`,
				)
			: [],
);
const coverage = Object.fromEntries(
	methodPaths.toSorted().map((name) => [
		name,
		{
			calls: analysis.calls[name]?.length ?? 0,
			arities: [
				...new Set(analysis.calls[name]?.map((c) => c.arguments.length) ?? []),
			].sort((a, b) => a - b),
		},
	]),
);
const header =
	"// Generated by npm run source:api; do not edit\n// Native members are complete for the recorded binary; unknown signatures stay unknown\n";
const declarations: string[] = [
	header,
	"export type UnverifiedNativeMethod = (...args: unknown[]) => unknown;\n",
];
for (const [name, entry] of Object.entries(native.exports)) {
	if (entry.kind !== "enum") continue;
	declarations.push(
		`export const ${name} = ${JSON.stringify(entry.values, null, 2)} as const;\nexport type ${name} = (typeof ${name})[keyof typeof ${name}];\n`,
	);
}
for (const [name, entry] of classes) {
	declarations.push(
		`export type Native${name} = {\n${Object.entries(entry.members)
			.map(([key, m]) => {
				const repository = repositories[key];
				const type =
					m.kind === "method"
						? "UnverifiedNativeMethod"
						: repository
							? `Native${repository}`
							: "unknown";
				return `\t${m.kind === "getter" ? "readonly " : ""}${JSON.stringify(key)}: ${type};`;
			})
			.join("\n")}\n};\n`,
	);
}
declarations.push(
	`export type NativeAddon = {\n${Object.entries(native.exports)
		.map(([name, entry]) => {
			const type =
				entry.kind === "class"
					? `{ new (...args: unknown[]): Native${name}; ${Object.entries(
							entry.statics,
						)
							.map(
								([key, m]) =>
									`${JSON.stringify(key)}: ${m.kind === "method" ? "UnverifiedNativeMethod" : "unknown"};`,
							)
							.join(" ")} }`
					: entry.kind === "function"
						? "UnverifiedNativeMethod"
						: entry.kind === "enum"
							? `typeof ${name}`
							: "unknown";
			return `\t${JSON.stringify(name)}: ${type};`;
		})
		.join("\n")}\n};\n`,
);
const catalog = { release: manifest.release, native, repositories, coverage };
await writeFile(
	path.join(root, "data/source-effects.json"),
	`${JSON.stringify({ release: manifest.release, nativeSha256: native.sha256, functionGraph: analysis.functionGraph }, null, 2)}\n`,
);

await writeFile(
	path.join(root, "data/builtin-api.json"),
	`${JSON.stringify({ release: manifest.release, extensions: analysis.builtinExtensions, definitions: analysis.builtinDefinitions, unresolved: analysis.unresolvedBuiltins }, null, 2)}\n`,
);
await writeFile(
	path.join(root, "data/backend-api.json"),
	`${JSON.stringify({ release: manifest.release, handlers: backendHandlers, unresolved: analysis.unresolvedHandlers }, null, 2)}\n`,
);
await writeFile(
	path.join(root, "data/native-api.json"),
	`${JSON.stringify(catalog, null, 2)}\n`,
);
await writeFile(
	path.join(root, "src/native/generated.mts"),
	declarations.join("\n"),
);
await writeFile(
	path.join(generated, "analysis.json"),
	`${JSON.stringify({ release: manifest.release, nativeSha256: native.sha256, parsed, ...analysis }, null, 2)}\n`,
);
console.log(
	JSON.stringify(
		{
			parsed,
			exports: Object.keys(native.exports).length,
			repositories: Object.keys(repositories).length,
			methods: methodPaths.length,
			withCallEvidence: Object.values(coverage).filter((c) => c.calls > 0)
				.length,
			unresolvedCandidates: analysis.unresolved.length,
			backendHandlers: Object.keys(analysis.handlers).length,
			reviewedBackendContracts: Object.keys(reviewedContracts).length,
			builtinExtensions: Object.keys(analysis.builtinExtensions).length,
			unresolvedBuiltins: analysis.unresolvedBuiltins.length,
			unresolvedHandlers: analysis.unresolvedHandlers.length,
		},
		null,
		2,
	),
);
