import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import aiPolicy from "../data/disable-ai.json" with { type: "json" };
import { analyzeSource } from "../src/source/analysis.mts";
import { SourceParser } from "../src/source/ast.mts";
import { openCorpus, readSources } from "../src/source/corpus.mts";
import { emptyAnalysis, mergeAnalysis } from "../src/source/model.mts";

const root = fileURLToPath(new URL("../", import.meta.url));
const corpus = await openCorpus();
const analysis = emptyAnalysis();
const sources = await readSources(corpus);
const parser = new SourceParser(sources);
try {
	for (const file of sources.keys())
		mergeAnalysis(analysis, analyzeSource(parser.parse(file), file));
} finally {
	parser[Symbol.dispose]();
}
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
					`AI policy preference storage changed: ${rule.id}.${key}, expected ${storage}`,
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
await writeFile(
	path.join(root, "data/builtin-api.json"),
	`${JSON.stringify({ release: corpus.manifest.release, extensions: analysis.builtinExtensions, definitions: analysis.builtinDefinitions, unresolved: analysis.unresolvedBuiltins }, null, 2)}\n`,
);
console.log(
	JSON.stringify(
		{
			parsed: sources.size,
			builtinExtensions: Object.keys(analysis.builtinExtensions).length,
			builtinCommands: builtinCommandIds.size,
			unresolvedBuiltins: analysis.unresolvedBuiltins.length,
		},
		null,
		2,
	),
);
