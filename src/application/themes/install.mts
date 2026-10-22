import { execFile as execFileCallback } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { Effect } from "effect";
import * as v from "valibot";
import { themeFileSchema } from "../../features/themes/themes.mts";
import { expandHome } from "../../platform/path.mts";
import { PATHS } from "../../shared/config.mts";
import { createRaycastClient } from "../client.mts";

const execFile = promisify(execFileCallback);

export async function installThemes(
	file: string,
): Promise<{ changed: boolean }> {
	const app = expandHome(process.env.RAYCAST_APP_BUNDLE || PATHS.appBundle);
	if (!existsSync(app)) throw new Error(`Raycast app not found: ${app}`);
	const config = v.parse(
		themeFileSchema,
		JSON.parse(await readFile(path.resolve(expandHome(file)), "utf8")),
	);
	const { changed } = await createRaycastClient().themes.apply(config.themes);
	if (changed) {
		await Effect.runPromise(
			Effect.gen(function* () {
				yield* Effect.ignore(
					Effect.tryPromise(() => execFile("/usr/bin/killall", ["Raycast"])),
				);
				yield* Effect.tryPromise({
					try: () => execFile("/usr/bin/open", ["-g", app]),
					catch: (error) => error,
				});
			}),
		);
	}
	return { changed };
}
