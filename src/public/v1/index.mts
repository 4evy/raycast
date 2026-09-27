import { createRaycastClient as createClient } from "../../application/client.mts";
import {
	configureFile as configure,
	consumerConfigSchema,
} from "../../application/configure.mts";
import { installThemes as install } from "../../application/install-themes.mts";
import {
	themesFromPalette as fromPalette,
	themeFileSchema,
} from "../../features/themes/themes.mts";
import { extractDatabaseKey as extract } from "../../platform/extract-key.mts";
import type {
	ConfigureResult,
	ConsumerConfig,
	RaycastClient,
	Theme,
	ThemeColor,
} from "./contracts.mts";

export * from "./contracts.mts";

/**
 * Create a client without opening a database
 * @remarks Each call owns its connection; operations are not a shared
 * transaction
 * @public
 */
export function createRaycastClient(): RaycastClient {
	return createClient();
}
/**
 * Apply a JSON configuration under the macOS process lock
 * @param path - Config file path; relative asset paths resolve beside this
 * file
 * @param ifPresent - Skip a missing file when true; defaults to false
 * @remarks May extract a key, download an avatar, write data, and launch
 * Raycast; earlier writes are not rolled back if a later step fails
 * @public
 */
export function configureFile(
	path: string,
	ifPresent = false,
): Promise<ConfigureResult> {
	return configure(path, ifPresent);
}
/**
 * Validate configuration and fill defaults without performing I/O
 * @remarks Throws on invalid input or a configuration that requests no
 * actions
 * @public
 */
export function parseConsumerConfig(value: unknown): ConsumerConfig {
	return consumerConfigSchema.parse(value);
}
/**
 * Read a theme file, apply its themes, and restart Raycast when changed
 * @param file - JSON file containing a nonempty themes array
 * @public
 */
export function installThemes(file: string): Promise<{ changed: boolean }> {
	return install(file);
}
/**
 * Capture or reuse the local database key and return process output
 * @remarks May start and restart Raycast; the key remains in its runtime
 * directory
 * @public
 */
export function extractDatabaseKey(): Promise<{
	stdout: string;
	stderr: string;
}> {
	return extract();
}
/**
 * Build light and dark themes from palette keys mapped to color roles
 * @remarks Returns light then dark; names gain Light and Dark suffixes;
 * throws when a mapped color is missing or is not a six-digit hex color
 * @public
 */
export function themesFromPalette(
	name: string,
	palettes: Record<"light" | "dark", Record<string, string>>,
	roles: Record<ThemeColor, string>,
): Theme[] {
	return fromPalette(name, palettes, roles);
}

/**
 * Validate a nonempty theme array without opening the database
 * @remarks Rejects duplicate name/appearance pairs and incomplete or invalid
 * colors
 * @public
 */
export function parseThemes(value: unknown): Theme[] {
	return themeFileSchema.parse({ themes: value }).themes;
}
