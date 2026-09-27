import { execFile as execFileCallback } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import untildify from "untildify";
import { themeFileSchema } from "../features/themes/themes.mts";
import { PATHS } from "../shared/config.mts";
import { createRaycastClient } from "./client.mts";

const execFile = promisify(execFileCallback);

export async function installThemes(
	file: string,
): Promise<{ changed: boolean }> {
	const app = untildify(process.env.RAYCAST_APP_BUNDLE || PATHS.appBundle);
	if (!existsSync(app)) throw new Error(`Raycast app not found: ${app}`);
	const config = themeFileSchema.parse(
		JSON.parse(await readFile(path.resolve(untildify(file)), "utf8")),
	);
	const { changed } = await createRaycastClient().themes.apply(config.themes);
	if (changed) {
		await execFile("/usr/bin/killall", ["Raycast"]).catch(() => {});
		await execFile("/usr/bin/open", ["-g", app]);
	}
	return { changed };
}
