import { withDatabase } from "../../platform/database.mts";
import type { RaycastClient } from "../../public/v1/contracts.mts";
import { databaseSummary } from "./inspect.mts";
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
