import { createAiOperations } from "../features/ai/operations.ts";
import { createAliasesOperations } from "../features/aliases/operations.ts";
import { createClipboardOperations } from "../features/clipboard/operations.ts";
import { createDatabaseOperations } from "../features/database/operations.ts";
import { createProfileOperations } from "../features/profile/operations.ts";
import { createThemesOperations } from "../features/themes/operations.ts";
import { createUserDefaultsOperations } from "../features/user/defaults/operations.ts";
import { API_VERSION, type RaycastClient } from "../public/v1/contracts.ts";
export function createRaycastClient(): RaycastClient {
	return {
		apiVersion: API_VERSION,
		database: createDatabaseOperations(),
		profile: createProfileOperations(),
		aliases: createAliasesOperations(),
		clipboard: createClipboardOperations(),
		userDefaults: createUserDefaultsOperations(),
		themes: createThemesOperations(),
		ai: createAiOperations(),
	};
}
