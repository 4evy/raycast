import * as v from "valibot";
import { withDatabase } from "../../../platform/database.mts";
import type {
	JsonValue,
	MutationOptions,
	RaycastClient,
	UserDefaultChange,
} from "../../../public/v1/contracts.mts";
import { parseStoredJson, userDefaultValue } from "../../database/inspect.mts";
export function createUserDefaultsOperations(): RaycastClient["userDefaults"] {
	const keySchema = v.pipe(v.string(), v.minLength(1));
	const numberSchema = v.pipe(v.number(), v.finite());
	const primitiveSchema = v.union([v.string(), numberSchema, v.boolean()]);
	const jsonSchema: v.GenericSchema<unknown, JsonValue> = v.lazy(() =>
		v.union([
			v.string(),
			numberSchema,
			v.boolean(),
			v.null(),
			v.array(jsonSchema),
			v.record(v.string(), jsonSchema),
		]),
	);

	async function writeDefault(
		key: string,
		stored: string | number | boolean,
		action: "set" | "set-json",
		{ dryRun = false }: MutationOptions = {},
	): Promise<UserDefaultChange> {
		v.parse(keySchema, key);
		v.parse(primitiveSchema, stored);
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
			v.parse(keySchema, key);
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
				JSON.stringify(v.parse(jsonSchema, value)),
				"set-json",
				options,
			),
		async delete(key, { dryRun = false } = {}) {
			v.parse(keySchema, key);
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
