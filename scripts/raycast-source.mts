import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
	copyFile,
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";
import release from "../release.json" with { type: "json" };
import { SourceParser, ts, walk } from "../src/source/ast.mts";
import {
	isJavaScript,
	type SourceManifest as Manifest,
	openCorpus,
	readSources,
} from "../src/source/corpus.mts";
import type { SourceAnalysis } from "../src/source/model.mts";
import { traceEffects } from "../src/source/trace.mts";

const root = fileURLToPath(new URL("../", import.meta.url));
const packageRoot = path.dirname(
	fileURLToPath(import.meta.resolve("raycast-app-source/package.json")),
);
const generated = path.join(packageRoot, "generated");
const cache = path.join(root, ".cache/raycast");
const resourcePath =
	"Contents/Resources/macos-app_RaycastDesktopApp.bundle/Contents/Resources";
function command(bin: string, args: string[]): string {
	return execFileSync(bin, args, {
		encoding: "utf8",
		maxBuffer: 8 * 1024 * 1024,
	});
}

async function digest(file: string): Promise<string> {
	const hash = createHash("sha256");
	for await (const chunk of createReadStream(file)) hash.update(chunk);
	return hash.digest("base64");
}

async function* files(directory: string): AsyncGenerator<string> {
	for (const entry of await readdir(directory, {
		recursive: true,
		withFileTypes: true,
	})) {
		if (entry.isFile()) {
			yield path.relative(directory, path.join(entry.parentPath, entry.name));
		}
	}
}

async function sync(): Promise<void> {
	if (process.platform !== "darwin") {
		throw new Error("Extracting the Raycast DMG requires macOS");
	}
	await mkdir(cache, { recursive: true });
	const lock = path.join(cache, "sync.lock");
	await mkdir(lock).catch(() => {
		throw new Error(
			`Another sync holds ${lock}; remove it only if that sync exited`,
		);
	});
	let stage: string | undefined;
	let mount: string | undefined;
	let attached = false;
	try {
		const dmg = path.join(cache, `Raycast-${release.version}.dmg`);
		if ((await digest(dmg).catch(() => "")) !== release.hash.slice(7)) {
			console.log(`Downloading Raycast ${release.version}`);
			const partial = `${dmg}.partial`;
			try {
				command("curl", [
					"--fail",
					"--location",
					"--silent",
					"--show-error",
					"--output",
					partial,
					release.url,
				]);
				if (`sha256-${await digest(partial)}` !== release.hash) {
					throw new Error("Downloaded DMG does not match release.json SHA-256");
				}
				await rename(partial, dmg);
			} finally {
				await rm(partial, { force: true });
			}
		}
		stage = await mkdtemp(path.join(packageRoot, ".stage-"));
		mount = await mkdtemp(path.join(cache, "mount-"));
		command("hdiutil", [
			"attach",
			"-readonly",
			"-nobrowse",
			"-mountpoint",
			mount,
			dmg,
		]);
		attached = true;
		const app = path.join(mount, "Raycast.app");
		const appVersion = command("plutil", [
			"-extract",
			"CFBundleShortVersionString",
			"raw",
			"-o",
			"-",
			path.join(app, "Contents/Info.plist"),
		]).trim();
		if (appVersion !== release.version)
			throw new Error(`Unexpected app version: ${appVersion}`);
		const resources = path.join(app, resourcePath);
		const manifest: Manifest = {
			release,
			appVersion,
			files: [],
			nativeAddons: [],
		};
		console.log("Extracting and formatting JavaScript (without executing it)");
		for await (const relative of files(resources)) {
			if (relative.endsWith(".node")) {
				const bytes = await readFile(path.join(resources, relative));
				manifest.nativeAddons.push({
					path: relative,
					bytes: bytes.length,
					sha256: createHash("sha256").update(bytes).digest("hex"),
				});
				continue;
			}
			if (
				!/\.(?:js|mjs|cjs|map|ts)$/.test(relative) &&
				path.basename(relative) !== "package.json"
			)
				continue;
			const raw = path.join(stage, "raw", relative);
			await mkdir(path.dirname(raw), { recursive: true });
			await copyFile(path.join(resources, relative), raw);
			const bytes = await readFile(raw);
			manifest.files.push({
				path: relative,
				bytes: bytes.length,
				sha256: createHash("sha256").update(bytes).digest("hex"),
			});
			if (isJavaScript(relative)) {
				const formatted = path.join(stage, "formatted", relative);
				await mkdir(path.dirname(formatted), { recursive: true });
				await writeFile(
					formatted,
					await format(bytes.toString("utf8"), {
						parser: "babel",
						printWidth: 100,
					}),
				);
				manifest.files[manifest.files.length - 1].formattedSha256 = createHash(
					"sha256",
				)
					.update(await readFile(formatted))
					.digest("hex");
			}
		}
		if (!manifest.files.some((file) => file.path === "backend/index.mjs"))
			throw new Error("Raycast backend bundle was not found");
		manifest.files.sort((a, b) => a.path.localeCompare(b.path));
		await writeFile(
			path.join(stage, "manifest.json"),
			`${JSON.stringify(manifest, null, 2)}\n`,
		);
		command("hdiutil", ["detach", mount]);
		attached = false;
		const previous = path.join(packageRoot, ".stage-previous");
		await rm(previous, { recursive: true, force: true });
		await rename(generated, previous).catch((error: NodeJS.ErrnoException) => {
			if (error.code !== "ENOENT") throw error;
		});
		try {
			await rename(stage, generated);
		} catch (error) {
			await rename(previous, generated).catch(() => {});
			throw error;
		}
		await rm(previous, { recursive: true, force: true });
		console.log(
			`Raycast ${appVersion}: ${manifest.files.length} files in ${generated}`,
		);
	} finally {
		try {
			if (attached && mount) {
				command("hdiutil", ["detach", mount]);
				attached = false;
			}
		} finally {
			if (stage) await rm(stage, { recursive: true, force: true });
			if (mount && !attached) await rm(mount, { recursive: true, force: true });
			await rm(lock, { recursive: true, force: true });
		}
	}
}

async function inspect(
	action: string,
	query?: string,
	filter = "",
): Promise<void> {
	if (!["list", "find", "calls", "check", "evidence", "trace"].includes(action))
		throw new Error(`Unknown source command: ${action}`);
	if (["find", "calls", "evidence", "trace"].includes(action) && !query)
		throw new Error(`${action} needs a search term`);
	const corpus = await openCorpus();
	const { manifest } = corpus;
	if (action === "evidence" || action === "trace") {
		const analysis = JSON.parse(
			await readFile(path.join(generated, "analysis.json"), "utf8").catch(
				() => {
					throw new Error("Run npm run source:api first");
				},
			),
		) as SourceAnalysis & { release: typeof release };
		if (analysis.release.hash !== release.hash)
			throw new Error("API evidence is stale; run npm run source:api");
		if (action === "trace") {
			console.log(
				JSON.stringify(
					traceEffects(
						analysis.functionGraph,
						analysis.handlers,
						query ?? "",
						filter,
					),
					null,
					2,
				),
			);
			return;
		}
		const matches = Object.entries(analysis.calls).filter(([name]) =>
			name.includes(query ?? ""),
		);
		console.log(JSON.stringify(Object.fromEntries(matches), null, 2));
		return;
	}
	if (action === "list") {
		for (const file of manifest.files)
			if (file.path.includes(filter) && (!query || file.path.includes(query)))
				console.log(`${file.path}\t${file.bytes}`);
		return;
	}
	const sources = await readSources(corpus, filter);
	let matches = 0;
	if (action === "find") {
		for (const [file, source] of sources)
			source.split("\n").forEach((line, index) => {
				if (line.includes(query ?? "")) {
					matches++;
					console.log(`${file}:${index + 1}: ${line.trim()}`);
				}
			});
	} else {
		const parser = new SourceParser(sources);
		try {
			for (const file of sources.keys()) {
				const ast = parser.parse(file);
				if (action !== "calls") continue;
				walk(ast, (node) => {
					if (!ts.isCallExpression(node) && !ts.isNewExpression(node)) return;
					const callee = node.expression.getText(ast);
					if (!callee.includes(query ?? "")) return;
					matches++;
					console.log(
						JSON.stringify({
							file,
							line:
								ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1,
							callee,
							arguments: (node.arguments ?? []).map((arg) => arg.getText(ast)),
						}),
					);
				});
			}
		} finally {
			parser[Symbol.dispose]();
		}
	}
	console.error(
		`${sources.size} JavaScript files ${action === "find" ? "searched" : "parsed"}; ${matches} matches; source hashes verified`,
	);
}

const [action, query, filter, ...extra] = process.argv.slice(2);
if (!action) {
	console.log(
		"Usage: npm run source:inspect -- <list [path] | find <text> [path] | calls <callee> [path] | evidence <method> | trace <handler> [effect] | check>\nSync pinned sources: npm run source:sync\nCheck latest release and sync: npm run source:latest",
	);
} else {
	if (extra.length || ((action === "sync" || action === "check") && query))
		throw new Error("Unexpected arguments");
	if (action === "sync") await sync();
	else await inspect(action, query, filter);
}
