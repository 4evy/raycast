import { z } from "zod";
import { withDatabase } from "../../platform/database.mts";
import type { RaycastClient } from "../../public/v1/contracts.mts";

const extensionId = "e:r:clipboard-history";

export const historyDurationSchema = z.enum([
	"5m",
	"60m",
	"P1D",
	"P1W",
	"P1M",
	"P3M",
	"P6M",
	"P1Y",
	"unlimited",
]);

export function createClipboardOperations(): RaycastClient["clipboard"] {
	return {
		async setHistoryDuration(input) {
			const duration = historyDurationSchema.parse(input);
			return withDatabase(async ({ db }) => {
				const current =
					await db.settings.getInternalExtensionSettings(extensionId);
				if (!current)
					throw new Error("clipboard history settings are unavailable");
				if (current.syncedMeta?.historyDuration === duration) return;
				await db.settings.updateInternalExtensionSettings(extensionId, {
					syncedMeta: { historyDuration: duration },
				});
				const updated =
					await db.settings.getInternalExtensionSettings(extensionId);
				if (updated?.syncedMeta?.historyDuration !== duration)
					throw new Error("clipboard history duration was not saved");
			});
		},
	};
}
