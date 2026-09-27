import { createAiOperations } from "../features/ai/operations.mts";
import { createAliasesOperations } from "../features/aliases/operations.mts";
import { createDatabaseOperations } from "../features/database/operations.mts";
import { createProfileOperations } from "../features/profile/operations.mts";
import { createThemesOperations } from "../features/themes/operations.mts";
import { createUserDefaultsOperations } from "../features/user-defaults/operations.mts";
import { API_VERSION, type RaycastClient } from "../public/v1/contracts.mts";
export function createRaycastClient(): RaycastClient {
	return {
		apiVersion: API_VERSION,
		database: createDatabaseOperations(),
		profile: createProfileOperations(),
		aliases: createAliasesOperations(),
		userDefaults: createUserDefaultsOperations(),
		themes: createThemesOperations(),
		ai: createAiOperations(),
	};
}
