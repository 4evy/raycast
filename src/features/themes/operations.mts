import { withDatabase } from "../../platform/database.mts";
import type { RaycastClient } from "../../public/v1/contracts.mts";
import { applyThemes, themeFileSchema } from "./themes.mts";
export function createThemesOperations(): RaycastClient["themes"] {
	return {
		async apply(themes, { dryRun = false } = {}) {
			const validated = themeFileSchema.parse({ themes });
			return withDatabase(async ({ db }) => ({
				dryRun,
				changed: await applyThemes(db, validated.themes, dryRun),
			}));
		},
	};
}
