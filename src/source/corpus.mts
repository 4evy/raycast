import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import release from "../../release.json" with { type: "json" };

export type SourceFileRecord = {
	path: string;
	bytes: number;
	sha256: string;
	formattedSha256?: string;
};
export type SourceManifest = {
	release: typeof release;
	appVersion: string;
	files: SourceFileRecord[];
	nativeAddons: SourceFileRecord[];
};
export const isJavaScript = (name: string): boolean =>
	/\.(?:mjs|cjs|js)$/.test(name);

export async function openCorpus() {
	const generated = path.dirname(
		fileURLToPath(import.meta.resolve("raycast-app-source/manifest.json")),
	);
	const manifest: SourceManifest = JSON.parse(
		await readFile(path.join(generated, "manifest.json"), "utf8").catch(() => {
			throw new Error("Run npm run source:sync first");
		}),
	);
	if (
		manifest.release.hash !== release.hash ||
		manifest.appVersion !== release.version
	)
		throw new Error("Extracted sources are stale; run npm run source:sync");
	const paths = new Set<string>();
	for (const file of manifest.files) {
		if (
			path.isAbsolute(file.path) ||
			file.path.split(/[\\/]/).includes("..") ||
			paths.has(file.path)
		)
			throw new Error(`Invalid or duplicate source path: ${file.path}`);
		paths.add(file.path);
	}
	const verify = (
		bytes: Buffer | string,
		hash: string | undefined,
		file: string,
	) => {
		if (createHash("sha256").update(bytes).digest("hex") !== hash)
			throw new Error(`Source hash mismatch: ${file}; run source:sync`);
	};
	return {
		generated,
		manifest,
		async read(file: SourceFileRecord): Promise<string | undefined> {
			const raw = await readFile(path.join(generated, "raw", file.path));
			verify(raw, file.sha256, file.path);
			if (!isJavaScript(file.path)) return undefined;
			const source = await readFile(
				path.join(generated, "formatted", file.path),
				"utf8",
			);
			verify(source, file.formattedSha256, `formatted/${file.path}`);
			return source;
		},
	};
}

export async function readSources(
	corpus: Awaited<ReturnType<typeof openCorpus>>,
	filter = "",
) {
	const sources = new Map<string, string>();
	for (const file of corpus.manifest.files) {
		if (!file.path.includes(filter)) continue;
		const source = await corpus.read(file);
		if (source !== undefined) sources.set(file.path, source);
	}
	return sources;
}
