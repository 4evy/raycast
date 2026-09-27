import catalog from "../../../data/native-api.json" with { type: "json" };
import { queryCount } from "../../native/query-count.mts";
import { describeNativeAddon } from "../../native/surface.mts";
import {
	dataAddonPath,
	loadRaycastDataAddon,
	type RaycastDatabaseClient,
} from "../../platform/database.mts";
import { PATHS, SUMMARY } from "../../shared/config.mts";

export function parseStoredJson(value: unknown): unknown {
	if (typeof value !== "string") return value;
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}

function callableMethods(value: object): string[] {
	return Object.entries(
		Object.getOwnPropertyDescriptors(Object.getPrototypeOf(value) ?? {}),
	)
		.filter(
			([name, descriptor]) =>
				name !== "constructor" && typeof descriptor.value === "function",
		)
		.map(([name]) => name);
}

export function addonSurface() {
	return {
		addon: dataAddonPath(),
		exports: describeNativeAddon(loadRaycastDataAddon()),
	};
}

export function databaseMethodSurface(db: RaycastDatabaseClient): {
	client: { methods: string[]; getters: string[] };
	repositories: Record<string, { methods: string[] }>;
} {
	const getters = Object.entries(
		Object.getOwnPropertyDescriptors(Object.getPrototypeOf(db) ?? {}),
	)
		.filter(([, descriptor]) => typeof descriptor.get === "function")
		.map(([name]) => name);

	return {
		client: { methods: callableMethods(db), getters },
		repositories: Object.fromEntries(
			getters
				.filter((name) => Object.hasOwn(catalog.repositories, name))
				.flatMap((name) => {
					const value: unknown = Reflect.get(db, name);
					return value && typeof value === "object"
						? [[name, { methods: callableMethods(value) }]]
						: [];
				}),
		),
	};
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
