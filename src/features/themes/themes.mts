import * as v from "valibot";
import {
	THEME_COLOR_FIELDS as fields,
	type RaycastDatabaseClient,
	type ThemeCreate,
} from "../../native/types.mts";

const color = v.pipe(
	v.string(),
	v.regex(/^#[0-9a-fA-F]{6}$/, "Expected a six-digit hex color"),
);
const colorsSchema = v.strictObject(v.entriesFromList(fields, color));
export const themeSchema = v.object({
	name: v.pipe(v.string(), v.minLength(1)),
	appearance: v.picklist(["light", "dark"]),
	colors: colorsSchema,
});
export const themeFileSchema = v.pipe(
	v.object({
		themes: v.pipe(v.array(themeSchema), v.minLength(1)),
	}),
	v.rawCheck(({ dataset, addIssue }) => {
		if (!dataset.typed) return;
		const { themes } = dataset.value;
		const seen = new Set<string>();
		themes.forEach((theme, index) => {
			const key = `${theme.appearance}\0${theme.name}`;
			if (seen.has(key)) {
				addIssue({
					message: "Duplicate theme name and appearance",
					path: [
						{
							type: "object",
							origin: "value",
							input: dataset.value,
							key: "themes",
							value: themes,
						},
						{
							type: "array",
							origin: "value",
							input: themes,
							key: index,
							value: theme,
						},
					],
				});
			}
			seen.add(key);
		});
	}),
);
export type Theme = v.InferOutput<typeof themeSchema>;

export function themesFromPalette(
	name: string,
	palettes: Record<"light" | "dark", Record<string, string>>,
	roles: Record<(typeof fields)[number], string>,
): Theme[] {
	return (["light", "dark"] as const).map((appearance) =>
		v.parse(themeSchema, {
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
	const general = await db.settings.getGeneralSettings();
	let modified = false;
	for (const theme of themes) {
		const desired: ThemeCreate = {
			name: theme.name,
			appearance: theme.appearance,
			...theme.colors,
		};
		const current = installed.find(
			(item) =>
				item.name === desired.name && item.appearance === desired.appearance,
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
