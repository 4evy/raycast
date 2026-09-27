import { isRecord } from "is-record";
import { z } from "zod";
import type { RaycastDatabaseClient } from "../../native/types.mts";

const aliasSchema = z.object({
	id: z.string().min(1),
	extensionId: z.string().min(1),
	alias: z
		.string()
		.regex(/^\S*$/, "Alias cannot contain whitespace")
		.nullable()
		.transform((value) => (value === "" ? null : value)),
	enabled: z.boolean().optional(),
});
export const aliasesSchema = z
	.array(
		z.preprocess((value) => {
			if (!isRecord(value)) return value;
			return {
				...value,
				extensionId: value.extensionId ?? value.extension_id,
			};
		}, aliasSchema),
	)
	.superRefine((entries, ctx) => {
		const ids = new Set<string>();
		entries.forEach(({ id }, index) => {
			if (ids.has(id))
				ctx.addIssue({
					code: "custom",
					path: [index, "id"],
					message: "Duplicate alias command",
				});
			ids.add(id);
		});
	});

export function parseAliasPayload(value: unknown) {
	return aliasesSchema.parse(value);
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
