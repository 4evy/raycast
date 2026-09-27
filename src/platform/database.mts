import { glob, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { pathExists } from "path-exists";
import semver from "semver";
import untildify from "untildify";
import type {
	RaycastDatabaseClient,
	RaycastDatabaseContext,
	RaycastLogger,
	RaycastNativeAddon,
} from "../native/types.mts";
import { envName, PATHS } from "../shared/config.mts";

const require = createRequire(import.meta.url);

export type {
	RaycastDatabaseClient,
	RaycastDatabaseContext,
	RaycastNativeAddon,
};

function envOr(key: keyof typeof PATHS.env, fallback: string): string {
	return untildify(process.env[envName(key)] || fallback);
}

export function dataAddonPath(): string {
	return envOr(
		"dataAddon",
		path.join(envOr("appBundle", PATHS.appBundle), PATHS.dataAddon),
	);
}

export function backupPath(appSupport: string): string {
	return envOr(
		"aiDisableBackup",
		path.join(appSupport, PATHS.aiDisableBackupName),
	);
}

export function loadRaycastDataAddon(): RaycastNativeAddon {
	return require(dataAddonPath()) as RaycastNativeAddon;
}

export async function latestRaycastNodeBin(
	appSupport: string,
): Promise<string | undefined> {
	const runtimeDir = path.join(appSupport, PATHS.nodeRuntime);
	const matches = await Array.fromAsync(
		glob(PATHS.nodeGlob, { cwd: runtimeDir }),
	).catch(() => [] as string[]);

	return matches
		.map((relative) => ({
			bin: path.join(runtimeDir, path.dirname(relative)),
			version: semver.valid(
				relative
					.split(path.sep)[0]
					?.replace(/^node-/, "")
					.replace(/-darwin-(?:arm64|x64)$/, ""),
			),
		}))
		.filter(
			(entry): entry is { bin: string; version: string } =>
				entry.version !== null,
		)
		.toSorted((left, right) => semver.rcompare(left.version, right.version))
		.at(0)?.bin;
}

export async function findKeyFile(
	appSupport: string,
): Promise<string | undefined> {
	const configuredPath = process.env[envName("keyFile")];
	const configured = configuredPath && untildify(configuredPath);
	if (configured) return configured;

	const nodeBin = await latestRaycastNodeBin(appSupport);
	if (nodeBin) {
		const cached = path.join(nodeBin, PATHS.keyCacheName);
		if (await pathExists(cached)) return cached;
	}

	return undefined;
}

export async function readKey(keyFile: string | undefined): Promise<string> {
	if (!keyFile) throw new Error("Raycast database key file was not found");

	const bytes = await readFile(keyFile);
	if (bytes.includes(0)) {
		throw new Error(
			`${keyFile} contains raw key bytes; use the runtime ${PATHS.keyCacheName} dumped by keydump.cts`,
		);
	}

	const key = bytes.toString("utf8").trim();
	if (!key) throw new Error("Raycast database key file is empty");
	return key;
}

export async function openDatabaseWithKey({
	appSupport,
	key,
	nativeAddon,
	logger = () => {},
}: {
	appSupport: string;
	key: string;
	nativeAddon: string;
	logger?: RaycastLogger;
}): Promise<RaycastDatabaseClient> {
	const addon = require(nativeAddon) as RaycastNativeAddon;
	const db = new addon.DatabaseClient(appSupport, key, logger);
	if (!db.initReport?.overallSuccess) {
		const failure = new Error(
			`failed to open Raycast database: ${JSON.stringify(db.initReport)}`,
		);
		try {
			await db.shutdown();
		} catch (cleanup) {
			throw new AggregateError([failure, cleanup], failure.message);
		}
		throw failure;
	}
	return db;
}

export async function loadDatabase(): Promise<RaycastDatabaseContext> {
	const appSupport = envOr("appSupport", PATHS.appSupport);
	const keyFile = await findKeyFile(appSupport);
	const db = await openDatabaseWithKey({
		appSupport,
		key: await readKey(keyFile),
		nativeAddon: dataAddonPath(),
	});

	let closed = false;
	return {
		db,
		appSupport,
		keyFile,
		async [Symbol.asyncDispose]() {
			if (closed) return;
			closed = true;
			await db.shutdown();
		},
	};
}

export async function withDatabase<T>(
	action: (context: RaycastDatabaseContext) => Promise<T>,
): Promise<T> {
	await using context = await loadDatabase();
	return await action(context);
}
