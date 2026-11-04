import * as v from "valibot";
import { withDatabase } from "../../platform/database.ts";
import type { RaycastClient } from "../../public/v1/contracts.ts";
import { applyThemes, themeFileSchema } from "./themes.ts";
export function createThemesOperations(): RaycastClient["themes"] {
	return {
		async apply(themes, { dryRun = false } = {}) {
			const validated = v.parse(themeFileSchema, { themes });
			return withDatabase(async ({ db }) => ({
				dryRun,
				changed: await applyThemes(db, validated.themes, dryRun),
			}));
		},
	};
}
