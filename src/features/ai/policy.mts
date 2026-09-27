import { isDeepStrictEqual } from "node:util";
import get from "es-toolkit/compat/get";
import size from "es-toolkit/compat/size";
import { isRecord } from "is-record";
import { loadJsonFile } from "load-json-file";
import pMap from "p-map";
import { pathExists } from "path-exists";
import { writeJsonFile } from "write-json-file";
import { z } from "zod";
import { queryCount } from "../../native/query-count.mts";
import type { FrecencyRecord } from "../../native/types.mts";
import type { RaycastDatabaseClient } from "../../platform/database.mts";
import {
	deleteMacOSDefault,
	type MacOSDefaultValue,
	readMacOSDefault,
	restoreMacOSDefault,
} from "../../platform/macos.mts";
import {
	type ExtensionRule,
	IO,
	OP,
	POLICY,
	type StatusField,
} from "../../shared/config.mts";

export type JsonObject = Record<string, unknown>;
export type Operation = {
	type: string;
	apply: () => Promise<unknown> | unknown;
	[key: string]: unknown;
};

export type Snapshot = {
	version: number;
	createdAt: string;
	internalExtensions: Record<string, JsonObject>;
	models: Record<string, { disabledAt: string | null }>;
	frecencyRecords: FrecencyRecord[];
	macOSDefaults: Record<string, MacOSDefaultValue>;
};

type CollectionKey = Exclude<keyof Snapshot, "version" | "createdAt">;

type Collection<K extends CollectionKey> = {
	key: K;
	snapshot: (db: RaycastDatabaseClient) => Promise<Snapshot[K]>;
	disable: (input: {
		db: RaycastDatabaseClient;
		value: Snapshot[K];
		now: string;
	}) => Operation[];
	restore: (input: {
		db: RaycastDatabaseClient;
		value: Snapshot[K];
	}) => Operation[];
};

function collection<K extends CollectionKey>(spec: Collection<K>) {
	return {
		key: spec.key,
		snapshot: spec.snapshot,
		disable: (db: RaycastDatabaseClient, before: Snapshot, now: string) =>
			spec.disable({ db, value: before[spec.key], now }),
		restore: (db: RaycastDatabaseClient, backup: Snapshot) =>
			spec.restore({ db, value: backup[spec.key] }),
	};
}

function op(
	type: string,
	fields: JsonObject,
	apply: Operation["apply"],
): Operation {
	return { type, ...fields, apply };
}

export function isRaycastAiItemId(itemId: unknown): itemId is string {
	return (
		typeof itemId === "string" &&
		POLICY.frecencyPrefixes.some((prefix) => itemId.startsWith(prefix))
	);
}

function disabledInternalExtension(
	previous: Record<string, unknown>,
	{ id: _id, ...patch }: ExtensionRule,
): Record<string, unknown> {
	if (!previous.id)
		throw new Error("internal extension settings are missing an id");

	// Raycast 2.5.1's backend Kzt enables content indexing whenever contentSearch
	// is true and contentSearchEngine is not "native". Empty scopes alone do not
	// disable it; the file-search policy selects the native engine explicitly
	return structuredClone({
		...previous,
		...patch,
		syncedMeta: {
			...(isRecord(previous.syncedMeta) ? previous.syncedMeta : {}),
			...patch.syncedMeta,
		},
		localMeta: {
			...(isRecord(previous.localMeta) ? previous.localMeta : {}),
			...patch.localMeta,
		},
		enabledFallbackCommandIds:
			patch.enabledFallbackCommandIds ??
			previous.enabledFallbackCommandIds ??
			[],
	});
}

async function restoreInternalExtension(
	db: RaycastDatabaseClient,
	id: string,
	previous: JsonObject,
): Promise<void> {
	const current = await db.settings.getInternalExtensionSettings(id);
	// The native update method merges metadata, including null values. Replacing
	// the row is necessary to remove preferences absent from the original backup
	if (current) await db.settings.deleteInternalExtensionSettings(id);
	if (!previous.id) return;
	try {
		await db.settings.addInternalExtensionSettings(previous);
	} catch (error) {
		if (current) {
			try {
				await db.settings.addInternalExtensionSettings(current);
			} catch (rollbackError) {
				throw new AggregateError(
					[error, rollbackError],
					`failed to restore ${id} and recover its previous settings; retain the backup`,
				);
			}
		}
		throw error;
	}
}

const COLLECTIONS = [
	collection({
		key: "internalExtensions",
		snapshot: async (db) =>
			Object.fromEntries(
				await pMap(POLICY.internalExtensions, async ({ id }) => [
					id,
					structuredClone(
						(await db.settings.getInternalExtensionSettings(id)) ?? {},
					),
				]),
			),
		disable: ({ db, value }) =>
			POLICY.internalExtensions.flatMap((rule) => {
				const previous = value[rule.id];
				// Missing rows inherit the built-in enabled default. Persist the policy
				// for fresh installations too, while recording absence for restore
				const next = disabledInternalExtension(
					previous?.id ? previous : { id: rule.id, enabled: true },
					rule,
				);
				return [
					op(
						OP.INTERNAL_EXTENSION,
						{
							id: rule.id,
							enabled: next.enabled,
							clearedFallbackCommands:
								"enabledFallbackCommandIds" in rule
									? POLICY.fallbackCommandIds
									: [],
						},
						() =>
							previous?.id
								? db.settings.updateInternalExtensionSettings(rule.id, next)
								: db.settings.addInternalExtensionSettings(next),
					),
				];
			}),
		restore: ({ db, value }) =>
			Object.entries(value).map(([id, previous]) =>
				op(OP.INTERNAL_EXTENSION, { id, enabled: previous.enabled }, () =>
					restoreInternalExtension(db, id, previous),
				),
			),
	}),
	collection({
		key: "models",
		snapshot: async (db) =>
			Object.fromEntries(
				(await db.ai.modelGetAll()).map((model) => [
					model.id,
					{ disabledAt: model.disabledAt ?? null },
				]),
			),
		disable: ({ db, value, now }) =>
			Object.keys(value)
				.filter((id) => value[id]?.disabledAt == null)
				.map((id) =>
					op(OP.MODEL, { id, disabledAt: now }, () =>
						db.ai.modelSetDisabledAt(id, now),
					),
				),
		restore: ({ db, value }) =>
			Object.entries(value).map(([id, previous]) => {
				const disabledAt = previous.disabledAt ?? null;
				return op(OP.MODEL, { id, disabledAt }, () =>
					db.ai.modelSetDisabledAt(id, disabledAt ?? undefined),
				);
			}),
	}),
	collection({
		key: "frecencyRecords",
		snapshot: async (db) =>
			(await db.frecency.getRecords()).filter((record) =>
				isRaycastAiItemId(record.itemId),
			),
		disable: ({ db, value }) =>
			value.map((record) =>
				op(OP.FRECENCY, { itemId: record.itemId, action: "reset" }, () =>
					db.frecency.reset(record.itemId),
				),
			),
		restore: ({ db, value }) =>
			value.length
				? [
						op(OP.FRECENCY, { restoredRecords: value.length }, () =>
							db.frecency.insertMany(value),
						),
					]
				: [],
	}),
	collection({
		key: "macOSDefaults",
		snapshot: async () =>
			Object.fromEntries(
				await pMap(POLICY.macOSDefaults, async (rule) => [
					rule.key,
					await readMacOSDefault(rule),
				]),
			),
		disable: ({ value }) =>
			Object.keys(value).map((key) =>
				op(OP.MACOS_DEFAULT, { key, action: "delete" }, () =>
					deleteMacOSDefault({ key }),
				),
			),
		restore: ({ value }) =>
			Object.entries(value).map(([key, defaultValue]) =>
				op(OP.MACOS_DEFAULT, { key, exists: defaultValue.exists }, () =>
					restoreMacOSDefault(defaultValue),
				),
			),
	}),
] as const;

async function runOperations(
	operations: Operation[],
	dryRun: boolean,
): Promise<JsonObject[]> {
	if (!dryRun) {
		for (const current of operations) await current.apply();
	}
	return operations.map(({ apply: _apply, ...summary }) => summary);
}

export async function buildSnapshot(
	db: RaycastDatabaseClient,
): Promise<Snapshot> {
	return {
		version: POLICY.backupVersion,
		createdAt: new Date().toISOString(),
		...Object.fromEntries(
			await Promise.all(
				COLLECTIONS.map(async (entry) => [entry.key, await entry.snapshot(db)]),
			),
		),
	} as Snapshot;
}

export async function applyDisabled(
	db: RaycastDatabaseClient,
	before: Snapshot,
	dryRun: boolean,
): Promise<JsonObject[]> {
	const now = new Date().toISOString();
	return runOperations(
		COLLECTIONS.flatMap((entry) => entry.disable(db, before, now)),
		dryRun,
	);
}

const metadataSchema = z.record(z.string(), z.unknown()).nullish();
const extensionSchema = z.looseObject({
	id: z.string().optional(),
	enabled: z.boolean().optional(),
	enabledFallbackCommandIds: z.array(z.string()).optional(),
	updatedAt: z.string().optional(),
	syncedMeta: metadataSchema,
	localMeta: metadataSchema,
	macosSyncedMeta: metadataSchema,
	windowsSyncedMeta: metadataSchema,
});
const snapshotSchema = z.looseObject({
	version: z.literal(POLICY.backupVersion),
	createdAt: z.string(),
	internalExtensions: z
		.record(z.string(), extensionSchema)
		.superRefine((entries, ctx) => {
			for (const [id, settings] of Object.entries(entries)) {
				// An empty object records an extension absent when the backup was taken
				if (
					Object.keys(settings).length > 0 &&
					(settings.id !== id || typeof settings.enabled !== "boolean")
				) {
					ctx.addIssue({
						code: "custom",
						path: [id],
						message: "Invalid backup extension",
					});
				}
			}
		}),
	models: z.record(
		z.string(),
		z.looseObject({ disabledAt: z.string().nullable().default(null) }),
	),
	frecencyRecords: z.array(
		z.looseObject({
			itemId: z.string(),
			frecencyDate: z.number({
				error:
					"Backup requires raw frecencyDate; computed score records cannot be restored exactly",
			}),
			searchTerms: z.string().optional(),
			openedAt: z.string().optional(),
		}),
	),
	macOSDefaults: z.record(
		z.string(),
		z.looseObject({
			exists: z.boolean(),
			key: z.string(),
			restoreType: z.enum(["bool", "string"]),
			value: z.union([z.boolean(), z.string(), z.null()]),
		}),
	),
});

function asSnapshot(value: unknown): Snapshot {
	return snapshotSchema.parse(value);
}

async function loadBackup(file: string): Promise<Snapshot> {
	const result = snapshotSchema.safeParse(await loadJsonFile(file));
	if (!result.success) {
		throw new Error(
			`Raycast AI backup at ${file} is incompatible and cannot be safely restored. Keep the file; move it aside before disabling AI again. A new backup captures only the current settings`,
		);
	}
	return result.data;
}

const backupWriteOptions = { indent: IO.JSON_INDENT, mode: IO.FILE_MODE };

export async function ensureBackup(
	file: string,
	before: Snapshot,
	dryRun: boolean,
): Promise<boolean> {
	const current = asSnapshot(before);

	if (!(await pathExists(file))) {
		if (dryRun) return false;
		await writeJsonFile(file, current, backupWriteOptions);
		return true;
	}

	const existing = await loadBackup(file);
	const savedIds = new Set(
		existing.frecencyRecords.map((record) => record.itemId),
	);
	// Existing values win: repeated disables must retain the original settings
	const merged: Snapshot = {
		...existing,
		...Object.fromEntries(
			POLICY.mergeableBackupCollections.map((key) => {
				const currentValue: unknown = get(current, [key]);
				const existingValue: unknown = get(existing, [key]);
				return [
					key,
					{
						...(isRecord(currentValue) ? currentValue : {}),
						...(isRecord(existingValue) ? existingValue : {}),
					},
				];
			}),
		),
		frecencyRecords: [
			...existing.frecencyRecords,
			...current.frecencyRecords.filter(
				(record) => !savedIds.has(record.itemId),
			),
		],
	};

	if (dryRun || isDeepStrictEqual(existing, merged)) return false;
	await writeJsonFile(file, merged, backupWriteOptions);
	return true;
}

export async function restore(
	db: RaycastDatabaseClient,
	appSupport: string,
	backupPathFor: (appSupport: string) => string,
	dryRun: boolean,
): Promise<JsonObject[]> {
	const file = backupPathFor(appSupport);
	if (!(await pathExists(file))) throw new Error(`backup not found: ${file}`);

	const backup = await loadBackup(file);
	return runOperations(
		COLLECTIONS.flatMap((entry) => entry.restore(db, backup)),
		dryRun,
	);
}

function statusFieldValue(item: unknown, field: StatusField): unknown {
	const value: unknown = get(item, field.path);
	if (!field.count) return value ?? structuredClone(field.defaultValue);
	if (typeof value === "number") return value;
	return typeof value === "object" ? size(value) : 0;
}

export async function status(
	db: RaycastDatabaseClient,
): Promise<Record<string, unknown>> {
	const [internalExtensions, models, frecencyRecords, macOSDefaults, aiData] =
		await Promise.all([
			pMap(POLICY.internalExtensions, async ({ id }) => {
				const item = await db.settings.getInternalExtensionSettings(id);
				if (!isRecord(item) || !item.id) return [id, { present: false }];
				return [
					id,
					{
						present: true,
						...Object.fromEntries(
							POLICY.statusFields.map((field) => [
								field.key,
								statusFieldValue(item, field),
							]),
						),
					},
				];
			}).then(Object.fromEntries),
			db.ai.modelGetAll(),
			db.frecency
				.getAll()
				.then((records) =>
					records.filter((record) => isRaycastAiItemId(record.itemId)),
				),
			pMap(POLICY.macOSDefaults, async (rule) => [
				rule.key,
				await readMacOSDefault(rule),
			]).then(Object.fromEntries),
			pMap(POLICY.aiDataQueries, (query) => queryCount(db, query)).then(
				Object.fromEntries,
			),
		]);

	return {
		internalExtensions,
		modelCount: models.length,
		disabledModelCount: models.filter((model) => model.disabledAt != null)
			.length,
		aiFrecencyCount: frecencyRecords.length,
		aiData,
		macOSDefaults,
	};
}
