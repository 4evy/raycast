import { z } from "zod";
import { withDatabase } from "../../platform/database.mts";
import type {
	MutationOptions,
	RaycastClient,
	UserDefaultChange,
} from "../../public/v1/contracts.mts";
import { parseStoredJson, userDefaultValue } from "../database/inspect.mts";
export function createUserDefaultsOperations(): RaycastClient["userDefaults"] {
	const keySchema = z.string().min(1);
	const primitiveSchema = z.union([z.string(), z.number(), z.boolean()]);

	async function writeDefault(
		key: string,
		stored: string | number | boolean,
		action: "set" | "set-json",
		{ dryRun = false }: MutationOptions = {},
	): Promise<UserDefaultChange> {
		keySchema.parse(key);
		primitiveSchema.parse(stored);
		return withDatabase(async ({ db }) => {
			const before = await userDefaultValue(db, key);
			if (!dryRun) await db.userDefaults.set(key, stored);
			return {
				dryRun,
				key,
				action,
				storedType: typeof stored,
				before,
				...(dryRun
					? { plannedAfter: parseStoredJson(stored) }
					: { after: await userDefaultValue(db, key) }),
			};
		});
	}
	return {
		async get(key) {
			keySchema.parse(key);
			return withDatabase(async ({ db }) => {
				const stored = await db.userDefaults.get(key);
				return {
					key,
					storedType: stored === null ? null : typeof stored,
					value: parseStoredJson(stored),
				};
			});
		},
		set: (key, value, options) => writeDefault(key, value, "set", options),
		setJson: (key, value, options) =>
			writeDefault(
				key,
				JSON.stringify(z.json().parse(value)),
				"set-json",
				options,
			),
		async delete(key, { dryRun = false } = {}) {
			keySchema.parse(key);
			return withDatabase(async ({ db }) => {
				const before = await userDefaultValue(db, key);
				if (!dryRun) await db.userDefaults.delete(key);
				return {
					dryRun,
					key,
					action: "delete",
					before,
					...(dryRun ? { plannedAfter: null } : { after: null }),
				};
			});
		},
	};
}
