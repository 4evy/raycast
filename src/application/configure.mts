import { execFile as execFileCallback } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtempDisposable, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import untildify from "untildify";
import { z } from "zod";
import { aliasesSchema } from "../features/aliases/aliases.mts";
import { currentUserSchema } from "../features/profile/profile.mts";
import { extractDatabaseKey } from "../platform/extract-key.mts";
import { PATHS } from "../shared/config.mts";
import { createRaycastClient } from "./client.mts";
import { installThemes } from "./install-themes.mts";

const execFile = promisify(execFileCallback);
const profileSchema = z.object({
	currentUser: currentUserSchema,
	avatarUrl: z.url().optional(),
	avatarFile: z.string().min(1).optional(),
});
export const consumerConfigSchema = z
	.object({
		profile: profileSchema.optional(),
		commandAliases: aliasesSchema.default([]),
		themesFile: z.string().min(1).optional(),
		disableAi: z.boolean().default(false),
		launch: z.boolean().default(false),
	})
	.refine(
		(config) =>
			config.profile !== undefined ||
			config.commandAliases.length > 0 ||
			config.themesFile !== undefined ||
			config.disableAi ||
			config.launch,
		"consumer config has no actions",
	);
export type ConsumerConfig = z.infer<typeof consumerConfigSchema>;

function resolveConsumerPath(file: string, from: string): string {
	return path.resolve(path.dirname(from), untildify(file));
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
	const configFile = path.resolve(untildify(configPath));
	if (!existsSync(configFile) && ifPresent) {
		return { applied: false, configFile, warnings: [] };
	}
	const config = consumerConfigSchema.parse(
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
					import.meta.url.endsWith(".mts")
						? "configure-worker.mts"
						: "configure-worker.mjs",
				),
				configFile,
			],
			{ maxBuffer: 8 * 1024 * 1024 },
		);
		return JSON.parse(stdout) as ConfigureResult;
	}
	const app = untildify(process.env.RAYCAST_APP_BUNDLE || PATHS.appBundle);
	if (!existsSync(app)) throw new Error(`Raycast app not found: ${app}`);
	if (
		config.profile ||
		config.commandAliases.length ||
		config.disableAi ||
		config.themesFile
	) {
		await extractDatabaseKey();
	}
	const client = createRaycastClient();
	const warnings: string[] = [];
	if (config.profile) {
		const currentUser = { ...config.profile.currentUser };
		try {
			const avatar = await prepareAvatar(
				config.profile,
				configFile,
				untildify(process.env.RAYCAST_APP_SUPPORT || PATHS.appSupport),
			);
			if (avatar) {
				currentUser.image = avatar;
				currentUser.avatar = avatar;
			}
		} catch (error) {
			warnings.push(`avatar unavailable: ${error}`);
		}
		await client.profile.apply(currentUser);
	}
	if (config.commandAliases.length) {
		await client.aliases.apply(config.commandAliases);
	}
	if (config.disableAi) await client.ai.disable();
	if (config.themesFile) {
		await installThemes(resolveConsumerPath(config.themesFile, configFile));
	}
	if (config.launch) await execFile("/usr/bin/open", [app]);
	return { applied: true, configFile, warnings };
}
