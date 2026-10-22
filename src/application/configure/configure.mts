import { execFile as execFileCallback } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtempDisposable, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { Effect } from "effect";
import * as v from "valibot";
import { aliasesSchema } from "../../features/aliases/aliases.mts";
import { historyDurationSchema } from "../../features/clipboard/operations.mts";
import { currentUserSchema } from "../../features/profile/profile.mts";
import { withDatabase } from "../../platform/database.mts";
import { extractDatabaseKey } from "../../platform/key/extract.mts";
import { expandHome } from "../../platform/path.mts";
import { PATHS } from "../../shared/config.mts";
import { createRaycastClient } from "../client.mts";
import { installThemes } from "../themes/install.mts";

const execFile = promisify(execFileCallback);
const profileAssetEntries = {
	avatarUrl: v.optional(v.pipe(v.string(), v.url())),
	avatarFile: v.optional(v.pipe(v.string(), v.minLength(1))),
};
const profileSchema = v.union([
	v.object({ ...profileAssetEntries, currentUser: currentUserSchema }),
	v.object({
		...profileAssetEntries,
		fallbackUser: currentUserSchema,
		currentUserPatch: v.record(v.string(), v.unknown()),
	}),
]);
const appAliasSchema = v.object({
	names: v.pipe(v.array(v.pipe(v.string(), v.minLength(1))), v.minLength(1)),
	alias: v.pipe(
		v.string(),
		v.minLength(1),
		v.regex(/^\S*$/, "Alias cannot contain whitespace"),
	),
	fallbackPath: v.optional(v.pipe(v.string(), v.minLength(1))),
	enabled: v.optional(v.boolean(), true),
});
export const consumerConfigSchema = v.pipe(
	v.object({
		profile: v.optional(profileSchema),
		commandAliases: v.optional(aliasesSchema, () => []),
		appAliases: v.optional(v.array(appAliasSchema), () => []),
		clipboardHistoryDuration: v.optional(historyDurationSchema),
		themesFile: v.optional(v.pipe(v.string(), v.minLength(1))),
		disableAi: v.optional(v.boolean(), false),
		launch: v.optional(v.boolean(), false),
	}),
	v.check(
		(config) =>
			config.profile !== undefined ||
			config.commandAliases.length > 0 ||
			config.appAliases.length > 0 ||
			config.clipboardHistoryDuration !== undefined ||
			config.themesFile !== undefined ||
			config.disableAi ||
			config.launch,
		"consumer config has no actions",
	),
);
export type ConsumerConfig = v.InferOutput<typeof consumerConfigSchema>;

const indexedAppSchema = v.object({
	name: v.string(),
	raycastId: v.pipe(v.string(), v.minLength(1)),
});
type IndexedApp = v.InferOutput<typeof indexedAppSchema>;

function indexedApps(value: unknown): IndexedApp[] {
	if (!Array.isArray(value))
		throw new Error("app index did not return an array");
	return value.filter((app): app is IndexedApp => v.is(indexedAppSchema, app));
}

async function resolveAppAliases(
	aliases: ConsumerConfig["appAliases"],
	warnings: string[],
) {
	if (!aliases.length) return [];
	return withDatabase(async ({ db }) => {
		const apps = indexedApps(await db.appIndex.getAllByContentType(0));
		return aliases.flatMap(({ names, alias, fallbackPath, enabled }) => {
			const app = names
				.map((name) => apps.find((candidate) => candidate.name === name))
				.find((candidate) => candidate !== undefined);
			const raycastId = app?.raycastId ?? fallbackPath;
			if (!raycastId) {
				warnings.push(
					`app alias ${alias}: no indexed app matched ${names.join(", ")}`,
				);
				return [];
			}
			return [
				{
					id: `c:r:applications::*::application::=::${raycastId}`,
					extensionId: "e:r:applications",
					alias,
					enabled,
				},
			];
		});
	});
}

function resolveConsumerPath(file: string, from: string): string {
	return path.resolve(path.dirname(from), expandHome(file));
}

async function prepareAvatar(
	profile: NonNullable<ConsumerConfig["profile"]>,
	configFile: string,
	appSupport: string,
): Promise<string | undefined> {
	if (!profile.avatarFile && !profile.avatarUrl) return undefined;
	await using temporary = await mkdtempDisposable(
		path.join(os.tmpdir(), "raycast-avatar-"),
	);
	const source = profile.avatarFile
		? resolveConsumerPath(profile.avatarFile, configFile)
		: path.join(temporary.path, "source");
	if (!profile.avatarFile) {
		if (!profile.avatarUrl) throw new Error("avatar URL is missing");
		const response = await fetch(profile.avatarUrl, {
			signal: AbortSignal.timeout(300_000),
		});
		if (!response.ok)
			throw new Error(`avatar download failed: ${response.status}`);
		await writeFile(source, Buffer.from(await response.arrayBuffer()));
	}
	const output = path.join(temporary.path, "avatar.png");
	await execFile("/usr/bin/sips", [
		"--resampleHeightWidthMax",
		"256",
		"--setProperty",
		"format",
		"png",
		source,
		"--out",
		output,
	]);
	const destination = path.join(appSupport, "avatar.png");
	await writeFile(destination, await readFile(output), { mode: 0o600 });
	return pathToFileURL(destination).href;
}

export type ConfigureResult = {
	applied: boolean;
	configFile: string;
	warnings: string[];
};

export async function configureFile(
	configPath: string,
	ifPresent = false,
): Promise<ConfigureResult> {
	const configFile = path.resolve(expandHome(configPath));
	if (!existsSync(configFile) && ifPresent) {
		return { applied: false, configFile, warnings: [] };
	}
	const config = v.parse(
		consumerConfigSchema,
		JSON.parse(await readFile(configFile, "utf8")),
	);
	if (!process.env.RAYCAST_LOCK_HELD) {
		const lock = `/tmp/raycast-manager-${process.getuid?.() ?? "user"}.lock`;
		const { stdout } = await execFile(
			"/usr/bin/lockf",
			[
				"-k",
				lock,
				"/usr/bin/env",
				"RAYCAST_LOCK_HELD=1",
				process.execPath,
				path.join(
					import.meta.dirname,
					import.meta.url.endsWith(".mts") ? "worker.mts" : "worker.mjs",
				),
				configFile,
			],
			{ maxBuffer: 8 * 1024 * 1024 },
		);
		return JSON.parse(stdout) as ConfigureResult;
	}
	const app = expandHome(process.env.RAYCAST_APP_BUNDLE || PATHS.appBundle);
	if (!existsSync(app)) throw new Error(`Raycast app not found: ${app}`);
	if (
		config.profile ||
		config.commandAliases.length ||
		config.appAliases.length ||
		config.clipboardHistoryDuration ||
		config.disableAi ||
		config.themesFile
	) {
		await extractDatabaseKey();
	}
	const client = createRaycastClient();
	const warnings: string[] = [];
	const appAliases = await resolveAppAliases(config.appAliases, warnings);
	const commandAliases = v.parse(aliasesSchema, [
		...config.commandAliases,
		...appAliases,
	]);
	if (config.profile) {
		const profile = config.profile;
		const storedProfile =
			"fallbackUser" in profile ? await client.profile.get() : undefined;
		const storedUser = v.safeParse(
			currentUserSchema,
			storedProfile?.currentUser,
		);
		const currentUser =
			"currentUser" in profile
				? { ...profile.currentUser }
				: v.parse(currentUserSchema, {
						...profile.fallbackUser,
						...(storedUser.success ? storedUser.output : {}),
						...profile.currentUserPatch,
					});
		await Effect.runPromise(
			Effect.tryPromise({
				try: () =>
					prepareAvatar(
						profile,
						configFile,
						expandHome(process.env.RAYCAST_APP_SUPPORT || PATHS.appSupport),
					),
				catch: (error) => error,
			}).pipe(
				Effect.match({
					onFailure: (error) => {
						warnings.push(`avatar unavailable: ${error}`);
					},
					onSuccess: (avatar) => {
						if (avatar) {
							currentUser.image = avatar;
							currentUser.avatar = avatar;
						}
					},
				}),
			),
		);
		await client.profile.apply(currentUser);
	}
	if (commandAliases.length) {
		await client.aliases.apply(commandAliases);
	}
	if (config.clipboardHistoryDuration)
		await client.clipboard.setHistoryDuration(config.clipboardHistoryDuration);
	if (config.disableAi) await client.ai.disable();
	if (config.themesFile) {
		await installThemes(resolveConsumerPath(config.themesFile, configFile));
	}
	if (config.launch) await execFile("/usr/bin/open", [app]);
	return { applied: true, configFile, warnings };
}
