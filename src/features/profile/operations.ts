import * as v from "valibot";
import { withDatabase } from "../../platform/database.ts";
import type { RaycastClient } from "../../public/v1/contracts.ts";
import { profileDefaults } from "../database/inspect.ts";
import {
	applyProfileDefaults,
	currentUserSchema,
	profileSummary,
} from "./profile.ts";
export function createProfileOperations(): RaycastClient["profile"] {
	return {
		get: () => withDatabase(({ db }) => profileDefaults(db)),
		async apply(currentUser, { dryRun = false } = {}) {
			const profile = { currentUser: v.parse(currentUserSchema, currentUser) };
			if (dryRun) return { dryRun: true, profile };
			return withDatabase(async ({ db }) => {
				const stored = await applyProfileDefaults(db, profile);
				return { dryRun: false, summary: profileSummary(stored), stored };
			});
		},
	};
}
