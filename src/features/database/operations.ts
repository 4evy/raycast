import { withDatabase } from "../../platform/database.ts";
import type { RaycastClient } from "../../public/v1/contracts.ts";
import { databaseSummary } from "./inspect.ts";
export function createDatabaseOperations(): RaycastClient["database"] {
	return {
		status: () =>
			withDatabase(async ({ db, appSupport, keyFile }) => ({
				appSupport,
				keyFile,
				initReport: db.initReport,
				status: await db.getDatabaseStatus(),
			})),
		summary: () =>
			withDatabase(async ({ db, appSupport, keyFile }) => ({
				appSupport,
				keyFile,
				summary: await databaseSummary(db),
			})),
	};
}
