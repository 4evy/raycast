import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

interface Release {
	version: string;
	url: string;
	hash: string;
}

const root = fileURLToPath(new URL("../../", import.meta.url));
const releasePath = path.join(root, "release.json");
const downloadUrl =
	"https://x.raycast-releases.com/download?platform=macos&architecture=arm64";
const releaseUrl =
	/^https:\/\/x-r2\.raycast-releases\.com\/Raycast_(?<version>[0-9]+(?:\.[0-9]+){3})_[0-9a-f]+_arm64\.dmg$/;

async function reportChanged(): Promise<void> {
	if (process.env.GITHUB_OUTPUT) {
		await appendFile(process.env.GITHUB_OUTPUT, "changed=true\n");
	}
}

async function hashDownload(url: string): Promise<string> {
	const download = spawn(
		"curl",
		["--fail", "--silent", "--show-error", "--location", url],
		{ stdio: ["ignore", "pipe", "inherit"] },
	);
	const hash = createHash("sha256");
	const [[code]] = await Promise.all([
		once(download, "close"),
		pipeline(download.stdout, hash),
	]);
	if (code !== 0) throw new Error("Raycast download failed");
	return `sha256-${hash.digest("base64")}`;
}

async function main(): Promise<void> {
	const { stdout: url } = await promisify(execFile)(
		"curl",
		[
			"--fail",
			"--silent",
			"--show-error",
			"--head",
			"--output",
			"/dev/null",
			"--write-out",
			"%{redirect_url}",
			downloadUrl,
		],
		{ timeout: 30_000 },
	);
	const match = releaseUrl.exec(url);
	if (!match?.groups)
		throw new Error(`Unexpected Raycast download URL: ${url}`);

	const current = JSON.parse(await readFile(releasePath, "utf8")) as Release;
	if (current.url === url) {
		console.log(`Raycast ${current.version} is current`);
		return;
	}

	const updated: Release = {
		version: match.groups.version,
		url,
		hash: await hashDownload(url),
	};
	await writeFile(releasePath, `${JSON.stringify(updated, null, 2)}\n`);
	await reportChanged();
	console.log(`Updated Raycast ${current.version} -> ${updated.version}`);
}

await main();
