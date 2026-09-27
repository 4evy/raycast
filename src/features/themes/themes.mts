import { isRecord } from "is-record";
import { z } from "zod";
import {
	THEME_COLOR_FIELDS as fields,
	type RaycastDatabaseClient,
	type ThemeCreate,
} from "../../native/types.mts";

const color = z
	.string()
	.regex(/^#[0-9a-fA-F]{6}$/, "Expected a six-digit hex color");
const colorsSchema = z.record(z.enum(fields), color);
export const themeSchema = z.object({
	name: z.string().min(1),
	appearance: z.enum(["light", "dark"]),
	colors: colorsSchema,
});
export const themeFileSchema = z
	.object({
		themes: z.array(themeSchema).min(1),
	})
	.superRefine(({ themes }, context) => {
		const seen = new Set<string>();
		themes.forEach(({ name, appearance }, index) => {
			const key = `${appearance}\0${name}`;
			if (seen.has(key)) {
				context.addIssue({
					code: "custom",
					path: ["themes", index],
					message: "Duplicate theme name and appearance",
				});
			}
			seen.add(key);
		});
	});
export type Theme = z.infer<typeof themeSchema>;

export function themesFromPalette(
	name: string,
	palettes: Record<"light" | "dark", Record<string, string>>,
	roles: Record<(typeof fields)[number], string>,
): Theme[] {
	return (["light", "dark"] as const).map((appearance) =>
		themeSchema.parse({
			name: `${name} ${appearance[0].toUpperCase()}${appearance.slice(1)}`,
			appearance,
			colors: Object.fromEntries(
				fields.map((field) => [field, palettes[appearance][roles[field]]]),
			),
		}),
	);
}

export async function applyThemes(
	db: RaycastDatabaseClient,
	themes: readonly Theme[],
	dryRun = false,
): Promise<boolean> {
	const installed = await db.settings.allThemes();
	if (!Array.isArray(installed))
		throw new Error("settings.allThemes returned an invalid response");
	const general = await db.settings.getGeneralSettings();
	if (!isRecord(general))
		throw new Error("settings.getGeneralSettings returned an invalid response");
	let modified = false;
	for (const theme of themes) {
		const desired: ThemeCreate = {
			name: theme.name,
			appearance: theme.appearance,
			...theme.colors,
		};
		const current = installed.find(
			(item) =>
				isRecord(item) &&
				item.name === desired.name &&
				item.appearance === desired.appearance,
		);
		let id = current?.id;
		if (!current) {
			if (dryRun) {
				modified = true;
				continue;
			}
			const created = await db.settings.addTheme(desired);
			id = created.id;
			modified = true;
		} else if (
			Object.entries(desired).some(
				([key, value]) => Reflect.get(current, key) !== value,
			)
		) {
			const updated = dryRun
				? current
				: await db.settings.updateTheme(current.id, desired);
			id = updated?.id;
			modified = true;
		}
		if (typeof id !== "string")
			throw new Error(`theme ID missing for ${theme.name}`);
		const settingKey =
			theme.appearance === "dark" ? "themeDarkId" : "themeLightId";
		if (general[settingKey] !== id) {
			const type = theme.appearance === "dark" ? "ThemeDarkId" : "ThemeLightId";
			if (!dryRun) await db.settings.updateGeneralSetting({ type, value: id });
			general[settingKey] = id;
			modified = true;
		}
	}
	return modified;
}
