import * as v from "valibot";
import { withDatabase } from "../../platform/database.ts";
import type { RaycastClient } from "../../public/v1/contracts.ts";
import { aliasesSchema, applyCommandAliases } from "./aliases.ts";
export function createAliasesOperations(): RaycastClient["aliases"] {
	return {
		async apply(input, { dryRun = false } = {}) {
			const aliases = v.parse(aliasesSchema, input);
			return withDatabase(async ({ db }) => ({
				dryRun,
				aliases: await applyCommandAliases(db, aliases, dryRun),
			}));
		},
	};
}
