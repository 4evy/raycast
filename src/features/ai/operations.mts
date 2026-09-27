import { backupPath, withDatabase } from "../../platform/database.mts";
import type { RaycastClient } from "../../public/v1/contracts.mts";
import {
	applyDisabled,
	buildSnapshot,
	ensureBackup,
	restore,
	status,
} from "./policy.mts";
export function createAiOperations(): RaycastClient["ai"] {
	return {
		status: () => withDatabase(({ db }) => status(db)),
		disable: ({ dryRun = false } = {}) =>
			withDatabase(async ({ db, appSupport, keyFile }) => {
				const backup = backupPath(appSupport);
				const before = await buildSnapshot(db);
				const backupWritten = await ensureBackup(backup, before, dryRun);
				const changes = await applyDisabled(db, before, dryRun);
				return {
					mode: "disable",
					dryRun,
					keyFile,
					backup,
					backupWritten,
					operations: changes.length,
					changes,
					status: await status(db),
				};
			}),
		restore: ({ dryRun = false } = {}) =>
			withDatabase(async ({ db, appSupport }) => {
				const changes = await restore(db, appSupport, backupPath, dryRun);
				return { dryRun, restored: changes.length, changes };
			}),
	};
}
