import { randomUUID } from "node:crypto";
import { access, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { Effect } from "effect";
import * as v from "valibot";
import { queryCount } from "../../native/query/count.mts";
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
	internalExtensions: Record<string, BackupExtension>;
	models: Record<string, { disabledAt: string | null }>;
	frecencyRecords: FrecencyRecord[];
	macOSDefaults: Record<string, MacOSDefaultValue>;
};

type CollectionKey = Exclude<keyof Snapshot, "version" | "createdAt">;

type BackupExtension = v.InferOutput<typeof extensionSchema>;

function attempt<A>(evaluate: () => PromiseLike<A>): Effect.Effect<A, unknown> {
	return Effect.tryPromise({ try: evaluate, catch: (error) => error });
}

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
	previous: BackupExtension,
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
			...previous.syncedMeta,
			...patch.syncedMeta,
		},
		localMeta: {
			...previous.localMeta,
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
	// Native updates merge metadata, including null values. Replace the row
	// to remove preferences absent from the original backup
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
				await Effect.runPromise(
					Effect.forEach(
						POLICY.internalExtensions,
						({ id }) =>
							attempt(
								async () =>
									[
										id,
										structuredClone(
											(await db.settings.getInternalExtensionSettings(id)) ??
												{},
										),
									] as const,
							),
						{ concurrency: "unbounded" },
					),
				),
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
				await Effect.runPromise(
					Effect.forEach(
						POLICY.macOSDefaults,
						(rule) =>
							attempt(
								async () => [rule.key, await readMacOSDefault(rule)] as const,
							),
						{ concurrency: "unbounded" },
					),
				),
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
			await Effect.runPromise(
				Effect.forEach(
					COLLECTIONS,
					(entry) => attempt(async () => [entry.key, await entry.snapshot(db)]),
					{ concurrency: "unbounded" },
				),
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

const metadataSchema = v.nullish(v.record(v.string(), v.unknown()));
const extensionSchema = v.looseObject({
	id: v.optional(v.string()),
	enabled: v.optional(v.boolean()),
	enabledFallbackCommandIds: v.optional(v.array(v.string())),
	updatedAt: v.optional(v.string()),
	syncedMeta: metadataSchema,
	localMeta: metadataSchema,
	macosSyncedMeta: metadataSchema,
	windowsSyncedMeta: metadataSchema,
});
const snapshotSchema = v.looseObject({
	version: v.literal(POLICY.backupVersion),
	createdAt: v.string(),
	internalExtensions: v.pipe(
		v.record(v.string(), extensionSchema),
		v.check(
			(entries) =>
				Object.entries(entries).every(
					([id, settings]) =>
						// Empty objects record extensions absent when the backup was taken
						Object.keys(settings).length === 0 ||
						(settings.id === id && typeof settings.enabled === "boolean"),
				),
			"Invalid backup extension",
		),
	),
	models: v.record(
		v.string(),
		v.looseObject({
			disabledAt: v.optional(v.nullable(v.string()), null),
		}),
	),
	frecencyRecords: v.array(
		v.looseObject({
			itemId: v.string(),
			frecencyDate: v.pipe(
				v.number(
					"Backup requires raw frecencyDate; computed score records cannot be restored exactly",
				),
				v.finite(),
			),
			searchTerms: v.optional(v.string()),
			openedAt: v.optional(v.string()),
		}),
	),
	macOSDefaults: v.record(
		v.string(),
		v.looseObject({
			exists: v.boolean(),
			key: v.string(),
			restoreType: v.picklist(["bool", "string"]),
			value: v.union([v.boolean(), v.string(), v.null()]),
		}),
	),
});

function asSnapshot(value: unknown): Snapshot {
	return v.parse(snapshotSchema, value);
}

async function loadBackup(file: string): Promise<Snapshot> {
	const content = new TextDecoder().decode(await readFile(file));
	const result = v.safeParse(snapshotSchema, JSON.parse(content));
	if (!result.success) {
		throw new Error(
			`Raycast AI backup at ${file} is incompatible and cannot be safely restored. Keep the file; move it aside before disabling AI again. A new backup captures only the current settings`,
		);
	}
	return result.output;
}

function backupExists(file: string): Effect.Effect<boolean> {
	return attempt(() => access(file)).pipe(
		Effect.as(true),
		Effect.catch(() => Effect.succeed(false)),
	);
}

function writeBackup(
	file: string,
	snapshot: Snapshot,
): Effect.Effect<void, unknown> {
	return Effect.gen(function* () {
		const directory = dirname(file);
		yield* attempt(() => mkdir(directory, { recursive: true }));
		const previous = yield* attempt(() => readFile(file, "utf8")).pipe(
			Effect.catch((error) =>
				(error as NodeJS.ErrnoException).code === "ENOENT"
					? Effect.succeed(undefined)
					: Effect.fail(error),
			),
		);
		const newline =
			previous === undefined || previous.endsWith("\n") ? "\n" : "";
		const content = `${JSON.stringify(snapshot, null, IO.JSON_INDENT)}${newline}`;
		const temporary = join(directory, `.${basename(file)}.${randomUUID()}.tmp`);
		// Keep the temporary file beside the destination so rename is atomic
		yield* Effect.acquireUseRelease(
			attempt(() => open(temporary, "wx", IO.FILE_MODE)),
			(handle) =>
				Effect.gen(function* () {
					yield* attempt(() => handle.writeFile(content, "utf8"));
					yield* attempt(() => handle.chmod(IO.FILE_MODE));
					yield* attempt(() => handle.sync());
					yield* attempt(() => handle.close());
					yield* attempt(() => rename(temporary, file));
				}),
			(handle) =>
				attempt(() => handle.close()).pipe(
					Effect.ensuring(
						Effect.orDie(attempt(() => rm(temporary, { force: true }))),
					),
				),
		);
	});
}

export async function ensureBackup(
	file: string,
	before: Snapshot,
	dryRun: boolean,
): Promise<boolean> {
	const current = asSnapshot(before);

	if (!(await Effect.runPromise(backupExists(file)))) {
		if (dryRun) return false;
		await Effect.runPromise(writeBackup(file, current));
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
				const collectionKey = key as Exclude<CollectionKey, "frecencyRecords">;
				return [
					key,
					{
						...current[collectionKey],
						...existing[collectionKey],
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
	await Effect.runPromise(writeBackup(file, merged));
	return true;
}

export async function restore(
	db: RaycastDatabaseClient,
	appSupport: string,
	backupPathFor: (appSupport: string) => string,
	dryRun: boolean,
): Promise<JsonObject[]> {
	const file = backupPathFor(appSupport);
	if (!(await Effect.runPromise(backupExists(file))))
		throw new Error(`backup not found: ${file}`);

	const backup = await loadBackup(file);
	return runOperations(
		COLLECTIONS.flatMap((entry) => entry.restore(db, backup)),
		dryRun,
	);
}

function statusFieldValue(item: BackupExtension, field: StatusField): unknown {
	const value = field.path.reduce<unknown>(
		(current, key) =>
			current == null ? undefined : (current as JsonObject)[key],
		item,
	);
	if (!field.count) return value ?? structuredClone(field.defaultValue);
	if (typeof value === "number") return value;
	if (Array.isArray(value)) return value.length;
	return value !== null && typeof value === "object"
		? Object.keys(value).length
		: 0;
}

export async function status(
	db: RaycastDatabaseClient,
): Promise<Record<string, unknown>> {
	const { internalExtensions, models, frecencyRecords, macOSDefaults, aiData } =
		await Effect.runPromise(
			Effect.all(
				{
					internalExtensions: Effect.forEach(
						POLICY.internalExtensions,
						({ id }) =>
							attempt(async () => {
								const item = await db.settings.getInternalExtensionSettings(id);
								if (!item?.id) return [id, { present: false }] as const;
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
								] as const;
							}),
						{ concurrency: "unbounded" },
					).pipe(Effect.map(Object.fromEntries)),
					models: attempt(() => db.ai.modelGetAll()),
					frecencyRecords: attempt(() => db.frecency.getAll()).pipe(
						Effect.map((records) =>
							records.filter((record) => isRaycastAiItemId(record.itemId)),
						),
					),
					macOSDefaults: Effect.forEach(
						POLICY.macOSDefaults,
						(rule) =>
							attempt(
								async () => [rule.key, await readMacOSDefault(rule)] as const,
							),
						{ concurrency: "unbounded" },
					).pipe(Effect.map(Object.fromEntries)),
					aiData: Effect.forEach(
						POLICY.aiDataQueries,
						(query) => attempt(() => queryCount(db, query)),
						{ concurrency: "unbounded" },
					).pipe(Effect.map(Object.fromEntries)),
				},
				{ concurrency: "unbounded" },
			),
		);

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
