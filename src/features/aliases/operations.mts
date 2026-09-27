import { withDatabase } from "../../platform/database.mts";
import type { RaycastClient } from "../../public/v1/contracts.mts";
import { aliasesSchema, applyCommandAliases } from "./aliases.mts";
export function createAliasesOperations(): RaycastClient["aliases"] {
	return {
		async apply(input, { dryRun = false } = {}) {
			const aliases = aliasesSchema.parse(input);
			return withDatabase(async ({ db }) => ({
				dryRun,
				aliases: await applyCommandAliases(db, aliases, dryRun),
			}));
		},
	};
}
