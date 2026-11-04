import { constants, readFileSync } from "node:fs";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import type { RaycastNativeAddon } from "../../src/native/types.ts";

const require = createRequire(import.meta.url);

async function verify() {
	const [appSupport, nativeAddon] = process.argv.slice(2);
	const key = readFileSync(0, "utf8").trim();
	if (!/^[\da-f]{64}$/i.test(key)) return 2;

	const temporary = await mkdtemp(path.join(os.tmpdir(), "raycast-key-"));
	try {
		// Native initialization can migrate or recover databases, so only open a
		// private copy, without the live database's WAL or shared-memory files
		await copyFile(
			path.join(appSupport, "main.db"),
			path.join(temporary, "main.db"),
			constants.COPYFILE_FICLONE,
		);
		const { DatabaseClient } = require(nativeAddon) as RaycastNativeAddon;
		const db = new DatabaseClient(temporary, key, () => {});
		try {
			const main = db.initReport.databaseResults.find(
				(result) => result.databaseType === "Main",
			);
			return main?.success &&
				main.existedInitially &&
				main.wasEncryptedInitially
				? 0
				: 2;
		} finally {
			await db.shutdown();
		}
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
}

try {
	process.exitCode = await verify();
} catch (error) {
	console.error(
		`cannot verify Raycast DB key: ${error instanceof Error ? error.message : String(error)}`,
	);
	process.exitCode = 1;
}
