import * as v from "valibot";
import type { RaycastDatabaseClient } from "../../native/types.mts";

const aliasSchema = v.pipe(
	v.looseObject({
		extensionId: v.optional(v.unknown()),
		extension_id: v.optional(v.unknown()),
	}),
	v.transform((value) => ({
		...value,
		extensionId: value.extensionId ?? value.extension_id,
	})),
	v.object({
		id: v.pipe(v.string(), v.minLength(1)),
		extensionId: v.pipe(v.string(), v.minLength(1)),
		alias: v.pipe(
			v.nullable(
				v.pipe(v.string(), v.regex(/^\S*$/, "Alias cannot contain whitespace")),
			),
			v.transform((value) => (value === "" ? null : value)),
		),
		enabled: v.optional(v.boolean()),
	}),
);
export const aliasesSchema = v.pipe(
	v.array(aliasSchema),
	v.rawCheck(({ dataset, addIssue }) => {
		if (!dataset.typed) return;
		const entries = dataset.value;
		const ids = new Set<string>();
		entries.forEach((entry, index) => {
			if (ids.has(entry.id)) {
				addIssue({
					message: "Duplicate alias command",
					path: [
						{
							type: "array",
							origin: "value",
							input: entries,
							key: index,
							value: entry,
						},
						{
							type: "object",
							origin: "value",
							input: entry,
							key: "id",
							value: entry.id,
						},
					],
				});
			}
			ids.add(entry.id);
		});
	}),
);

export function parseAliasPayload(value: unknown) {
	return v.parse(aliasesSchema, value);
}

export async function applyCommandAliases(
	db: RaycastDatabaseClient,
	aliases: ReturnType<typeof parseAliasPayload>,
	dryRun: boolean,
) {
	return Promise.all(
		aliases.map(async (entry) => {
			const before = await db.settings.getCommandSettings(entry.id);
			const update = {
				id: entry.id,
				extensionId: entry.extensionId,
				enabled: entry.enabled ?? before?.enabled ?? true,
				alias: entry.alias,
			};
			if (!dryRun) {
				await (before
					? db.settings.updateCommandSettings(entry.id, update)
					: db.settings.addCommandSettings(update));
			}
			return {
				id: entry.id,
				before,
				...(dryRun
					? { plannedAfter: { ...before, ...update } }
					: { after: await db.settings.getCommandSettings(entry.id) }),
			};
		}),
	);
}
