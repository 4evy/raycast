import { withDatabase } from "../../platform/database.mts";
import type { RaycastClient } from "../../public/v1/contracts.mts";
import { profileDefaults } from "../database/inspect.mts";
import {
	applyProfileDefaults,
	currentUserSchema,
	profileSummary,
} from "./profile.mts";
export function createProfileOperations(): RaycastClient["profile"] {
	return {
		get: () => withDatabase(({ db }) => profileDefaults(db)),
		async apply(currentUser, { dryRun = false } = {}) {
			const profile = { currentUser: currentUserSchema.parse(currentUser) };
			if (dryRun) return { dryRun: true, profile };
			return withDatabase(async ({ db }) => {
				const stored = await applyProfileDefaults(db, profile);
				return { dryRun: false, summary: profileSummary(stored), stored };
			});
		},
	};
}
