import { queryCount } from "../../native/query/count.mts";
import type { RaycastDatabaseClient } from "../../platform/database.mts";
import { PATHS, SUMMARY } from "../../shared/config.mts";

export function parseStoredJson(value: unknown): unknown {
	if (typeof value !== "string") return value;
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}

export async function databaseSummary(
	db: RaycastDatabaseClient,
): Promise<Record<string, unknown>> {
	const [databaseStatus, generalSettings, internalExtensions, ...countEntries] =
		await Promise.all([
			db.getDatabaseStatus(),
			db.settings.getGeneralSettings(),
			db.settings.allInternalExtensionsSettings(),
			...SUMMARY.counts.map((query) => queryCount(db, query)),
		]);

	return {
		databases: databaseStatus,
		generalSettings: Object.fromEntries(
			SUMMARY.generalSettings.map((key) => [
				key,
				Reflect.get(generalSettings, key),
			]),
		),
		internalExtensions: {
			total: internalExtensions.length,
			enabled: internalExtensions.filter((extension) => extension.enabled)
				.length,
			disabled: internalExtensions
				.filter((extension) => !extension.enabled)
				.map((extension) => extension.id)
				.toSorted(),
		},
		counts: Object.fromEntries(countEntries),
	};
}

export async function profileDefaults(
	db: RaycastDatabaseClient,
): Promise<{ currentUser: unknown; oauthToken: unknown }> {
	const { currentUser, oauthToken } = PATHS.profileUserDefaults;
	const [current, oauth] = await Promise.all([
		db.userDefaults.get(currentUser),
		db.userDefaults.get(oauthToken),
	]);
	return {
		currentUser: parseStoredJson(current),
		oauthToken: parseStoredJson(oauth),
	};
}

export async function userDefaultValue(
	db: RaycastDatabaseClient,
	key: string,
): Promise<unknown> {
	return parseStoredJson(await db.userDefaults.get(key));
}
