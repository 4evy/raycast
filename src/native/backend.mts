import catalog from "../../data/backend-api.json" with { type: "json" };
import type {
	DeletedNote,
	Note,
	NoteCreate,
	NoteUpdate,
	NoteWindowData,
	Page,
	PageCursor,
	Quicklink,
	QuicklinkCreate,
	QuicklinkUpdate,
	Snippet,
	SnippetCreate,
	SnippetUpdate,
} from "../features/documents/repositories.mts";
import type { FunctionEvidence, HandlerEvidence } from "../source/model.mts";
import { traceEffects } from "../source/trace.mts";
import type {
	CalculatorHistoryEntry,
	CalculatorHistoryInput,
	CalculatorResponse,
} from "./calculator.mts";
import type { DatabaseKind } from "./generated.mts";
import type {
	ScriptCancellationResult,
	ScriptCommand,
	ScriptCommandMode,
	ScriptExecutionInput,
	ScriptExecutionResult,
} from "./script-commands.mts";
import type {
	TranslateCustomCommand,
	TranslateCustomCommandInput,
	Translation,
	TranslationInput,
} from "./translator.mts";
import type {
	CommandSettings,
	CommandSettingsUpdate,
	DatabaseStatus,
	FrecencyScore,
	GeneralSettings,
	InternalExtensionSettings,
	JsonValue,
	KeyboardShortcut,
	ThemeCreate,
	ThemeRecord,
} from "./types.mts";
import type {
	WindowLayoutGroup,
	WindowLayoutGroupInput,
	WindowLayoutGroupUpdate,
} from "./window-management.mts";
import type {
	WindowsRunCommand,
	WindowsRunCommandCreate,
	WindowsRunCommandMatch,
	WindowsRunCommandUpdate,
} from "./windows-run.mts";

export type BackendTheme = ThemeCreate & {
	id: string;
	isBundled?: boolean;
	createdAt?: string;
	updatedAt?: string;
};
export type DatabaseRecoveryResult = {
	success: boolean;
	failedDatabases: DatabaseKind[];
};

export type CalculatorParseInput = {
	expression: string | { expression: string };
	locale?: string;
};
export type ParsedCalculatorDate = {
	date: string;
	hasTimeComponent: boolean;
	stringValue: string;
};
export type ParsedCalculatorDuration = {
	durationMs: number;
	stringValue: string;
};

export type DocumentListInput = {
	cursor?: PageCursor;
	limit?: number;
	filter?: string;
};
export type TaggedDocumentListInput = DocumentListInput & {
	tags?: string[];
	organizationId?: string;
};
export type BackendSnippet = Snippet & {
	organization?: { id: string; packId: string };
};
export type BackendQuicklink = Quicklink & {
	organization?: { id: string; packId: string };
};
export type QuicklinkLibraryEntry = {
	argumentCount: number;
	category: string;
	name: string;
	url: string;
	keywords?: string[];
};
export type NoteUpdateResult =
	| { status: "ok"; note: Note }
	| { status: "conflict" };

type NullableSetting =
	| "themeDarkId"
	| "themeLightId"
	| "hyperKeyCode"
	| "hyperKeyCapsLockAction"
	| "enforcedInputSourceId";
export type GeneralSettingsPatch = Partial<
	Omit<GeneralSettings, NullableSetting | "useSpotlightGesture">
> & {
	[K in NullableSetting]?: GeneralSettings[K] | null;
};

type MetadataColumns =
	| "syncedMeta"
	| "localMeta"
	| "macosSyncedMeta"
	| "windowsSyncedMeta"
	| "deprecatedMeta";

export type BackendCommandSettings = Omit<
	CommandSettings,
	MetadataColumns | "macosHotkey" | "windowsHotkey"
> & {
	meta: Record<string, JsonValue>;
	hotkey: KeyboardShortcut | null;
};
export type BackendInternalExtensionSettings = Omit<
	InternalExtensionSettings,
	MetadataColumns
> & { meta: Record<string, JsonValue> };

export type CommandHotkeyInput = Omit<KeyboardShortcut, "locality"> &
	Partial<Pick<KeyboardShortcut, "locality">>;
export type BackendCommandSettingsUpdate = {
	id: string;
	settings: Pick<
		CommandSettingsUpdate,
		| "enabled"
		| "alias"
		| "favoriteOrder"
		| "fallbackOrder"
		| "customSubtitle"
		| "assumedViewKind"
	> & { meta?: Record<string, JsonValue>; hotkey?: CommandHotkeyInput | null };
	preferenceHints?: Array<{ name: string; type: string }>;
	overwriteHotkeyConflict?: boolean;
};
export type CommandSettingsUpdateResult =
	| null
	| { error: "hotkey-conflict"; conflictingCommand: { name: string } }
	| { error: "hotkey-rejected"; reason: "invalid" | "already-registered" }
	| { warning: "hotkey-taken-by-other-app" };

// Backend results are decoded IPC data; the dispatcher serializes void as null
export type ReviewedBackendContracts = {
	"scriptCommands.runScript": (
		input: ScriptExecutionInput & { mode: ScriptCommandMode },
	) => Promise<ScriptExecutionResult>;
	// Startup failures arrive in ScriptCompletion, even when an ID is returned
	"scriptCommands.runScriptStreamed": (
		input: ScriptExecutionInput,
	) => Promise<{ executionId: string }>;
	"scriptCommands.cancelScript": (input: {
		executionId: string;
	}) => Promise<ScriptCancellationResult>;
	"scriptCommands.getScripts": () => Promise<ScriptCommand[]>;

	"translator.translate": (input: TranslationInput) => Promise<Translation[]>;
	"translator.getAllTranslateCustomCommands": () => Promise<
		TranslateCustomCommand[]
	>;
	"translator.getTranslateCustomCommand": (input: {
		id: string;
	}) => Promise<TranslateCustomCommand | null>;
	"translator.saveTranslateCustomCommand": (
		input: TranslateCustomCommandInput,
	) => Promise<TranslateCustomCommand>;
	"translator.updateTranslateCustomCommand": (input: {
		id: string;
		update: Partial<TranslateCustomCommandInput>;
	}) => Promise<TranslateCustomCommand>;
	"translator.deleteTranslateCustomCommand": (input: {
		id: string;
	}) => Promise<null>;

	"windowManagement.getAllLayouts": () => Promise<WindowLayoutGroup[]>;
	"windowManagement.getLayout": (input: {
		id: string;
	}) => Promise<WindowLayoutGroup | null>;
	"windowManagement.saveLayout": (
		input: WindowLayoutGroupInput,
	) => Promise<WindowLayoutGroup>;
	"windowManagement.updateLayout": (input: {
		id: string;
		update: WindowLayoutGroupUpdate;
	}) => Promise<null>;
	"windowManagement.deleteLayout": (input: { id: string }) => Promise<null>;
	"windowManagement.deleteAllLayouts": () => Promise<null>;
	"windowManagement.exportLayouts": (input: {
		path: string;
		ids?: string[];
	}) => Promise<{ exportedCount: number }>;
	"windowManagement.importLayouts": (input: {
		path: string;
	}) => Promise<{ importedCount: number; skippedCount: number }>;

	"windowsRunCommands.create": (
		input: WindowsRunCommandCreate,
	) => Promise<WindowsRunCommand>;
	"windowsRunCommands.update": (input: {
		id: string;
		update: WindowsRunCommandUpdate;
	}) => Promise<WindowsRunCommand>;
	"windowsRunCommands.delete": (input: {
		id: string;
	}) => Promise<WindowsRunCommand>;
	"windowsRunCommands.getAll": (input: {
		cursor?: PageCursor;
		limit?: number;
		filter?: string;
		tags?: string[];
	}) => Promise<Page<WindowsRunCommand>>;
	"windowsRunCommands.getOne": (input: {
		id: string;
	}) => Promise<WindowsRunCommand>;
	"windowsRunCommands.getByAlias": (input: {
		alias: string;
		limit?: number;
	}) => Promise<WindowsRunCommand[]>;
	"windowsRunCommands.getByCommand": (input: {
		command: string;
		arguments: string;
	}) => Promise<WindowsRunCommandMatch | null>;
	"windowsRunCommands.getTags": () => Promise<string[]>;
	"windowsRunCommands.pin": (input: { id: string }) => Promise<null>;
	"windowsRunCommands.unpin": (input: { id: string }) => Promise<null>;
	"windowsRunCommands.recordExecution": (input: {
		id: string;
	}) => Promise<null>;
	"windowsRunCommands.duplicate": (input: {
		id: string;
	}) => Promise<WindowsRunCommand>;
	"windowsRunCommands.deleteAll": () => Promise<null>;

	"calculator.calculate": (
		input: CalculatorParseInput,
	) => Promise<CalculatorResponse | null>;
	"calculator.parseDate": (
		input: CalculatorParseInput,
	) => Promise<ParsedCalculatorDate | null>;
	"calculator.parseDuration": (
		input: CalculatorParseInput,
	) => Promise<ParsedCalculatorDuration | null>;
	"calculator.refreshCurrencies": () => Promise<null>;
	"calculator.historyGetAll": (input: {
		filter?: string;
	}) => Promise<CalculatorHistoryEntry[]>;
	"calculator.historyUpsert": (
		input: CalculatorHistoryInput,
	) => Promise<string>;
	"calculator.historyDelete": (input: { id: string }) => Promise<null>;
	"calculator.historyDeleteAll": (input: {
		includePinned: boolean;
	}) => Promise<null>;
	"calculator.historyPin": (input: { id: string }) => Promise<null>;
	"calculator.historyUnpin": (input: { id: string }) => Promise<null>;
	"calculator.historyMovePinnedUp": (input: { id: string }) => Promise<null>;
	"calculator.historyMovePinnedDown": (input: { id: string }) => Promise<null>;

	"userDefaults.get": (
		key: string,
	) => Promise<string | number | boolean | null>;
	"userDefaults.set": (input: {
		key: string;
		value: string | number | boolean;
	}) => Promise<null>;
	"userDefaults.delete": (key: string) => Promise<null>;
	"appFlags.getAppFlags": () => Promise<Record<string, boolean>>;
	"appFlags.setDebugAppFlag": (input: {
		key: string;
		value: boolean;
	}) => Promise<null>;
	"database.getDatabaseStatus": () => Promise<DatabaseStatus>;
	"database.dismissRecreatedDatabases": () => Promise<null>;
	// Including Main resets only Main; other requested kinds are skipped
	"database.resetDatabases": (
		kinds: DatabaseKind[],
	) => Promise<DatabaseRecoveryResult>;
	"database.restoreDatabasesFromBackup": (
		kinds: DatabaseKind[],
	) => Promise<DatabaseRecoveryResult>;
	"themes.getAll": () => Promise<BackendTheme[]>;
	"themes.getById": (input: { id: string }) => Promise<BackendTheme>;
	"themes.create": (input: { theme: ThemeCreate }) => Promise<ThemeRecord>;
	"themes.update": (input: {
		theme: ThemeCreate & { id: string };
	}) => Promise<ThemeRecord>;
	"themes.delete": (input: { id: string }) => Promise<null>;

	"frecency.getAll": () => Promise<FrecencyScore[]>;
	"frecency.getAllByIds": (input: {
		items: string[];
	}) => Promise<FrecencyScore[]>;
	"frecency.visit": (input: {
		key: string;
		visitDate: number;
		searchTerm?: string;
	}) => Promise<FrecencyScore>;
	"frecency.search": (input: {
		query: string;
		samplingDate: number;
	}) => Promise<FrecencyScore[]>;
	"frecency.reset": (input: { key: string }) => Promise<null>;
	"settings.getGeneralSettings": () => Promise<GeneralSettings>;
	"settings.updateGeneralSettings": (
		input: GeneralSettingsPatch,
	) => Promise<null>;
	"settings.getAllCommandSettings": (input?: {
		extensionId?: string;
	}) => Promise<BackendCommandSettings[]>;
	"settings.getCommandSettings": (input: {
		id: string;
	}) => Promise<BackendCommandSettings | null>;
	"settings.getCommandHotkeyConflict": (input: {
		id: string;
		hotkey: KeyboardShortcut;
	}) => Promise<{ conflictingCommand: { name: string } } | null>;
	"settings.getHotkeyConflicts": () => Promise<{
		conflicts: Array<{
			commandId: string;
			conflictsWithCommandId: string;
			conflictsWithName: string;
		}>;
	}>;
	"settings.updateCommandSettings": (
		input: BackendCommandSettingsUpdate,
	) => Promise<CommandSettingsUpdateResult>;
	"settings.updateCommandSettingsBatch": (input: {
		updates: BackendCommandSettingsUpdate[];
	}) => Promise<null>;
	"settings.deleteCommandSettings": (input: { id: string }) => Promise<null>;
	"settings.getInternalExtensionSettings": (input: {
		extensionId: string;
	}) => Promise<BackendInternalExtensionSettings | null>;
	"settings.updateInternalExtensionSettings": (input: {
		extensionId: string;
		update: Partial<
			Pick<
				InternalExtensionSettings,
				| "enabled"
				| "enabledFallbackCommandIds"
				| "syncedMeta"
				| "localMeta"
				| "macosSyncedMeta"
				| "windowsSyncedMeta"
			>
		> & { meta?: Record<string, JsonValue> };
	}) => Promise<null>;
	"settings.getAllInternalExtensionSettings": () => Promise<
		BackendInternalExtensionSettings[]
	>;
	"settings.getContentZoom": () => Promise<{ ai: number; notes: number }>;
	"notes.create": (input: NoteCreate) => Promise<Note>;
	"notes.update": (input: {
		id: string;
		update: NoteUpdate;
		expectedUpdatedAt?: string;
	}) => Promise<NoteUpdateResult>;
	"notes.list": (input: DocumentListInput) => Promise<Page<Note>>;
	"notes.delete": (input: { id: string }) => Promise<null>;
	"notes.pin": (input: { id: string }) => Promise<null>;
	"notes.unpin": (input: { id: string }) => Promise<null>;
	"notes.movePinnedUp": (input: { id: string }) => Promise<null>;
	"notes.movePinnedDown": (input: { id: string }) => Promise<null>;
	"notes.touchAccessed": (input: { id: string }) => Promise<null>;
	"notes.recoverNote": (input: { id: string }) => Promise<null>;
	"notes.permanentlyDelete": (input: { id: string }) => Promise<null>;
	"notes.deleteAll": () => Promise<null>;
	"notes.emptyTrash": () => Promise<null>;
	"notes.purgeOldDeletedNotes": () => Promise<null>;
	"notes.browse": (input: DocumentListInput) => Promise<Page<Note>>;
	"notes.count": () => Promise<number>;
	"notes.getWindowData": (input: {
		noteId?: string;
	}) => Promise<NoteWindowData>;
	"notes.getCurrentWindowData": () => Promise<NoteWindowData>;
	"notes.setCurrentNote": (input: { noteId: string }) => Promise<null>;
	"notes.listDeleted": () => Promise<DeletedNote[]>;
	"snippets.create": (
		input: SnippetCreate & { organizationHandle?: string },
	) => Promise<string>;
	"snippets.update": (input: {
		id: string;
		update: SnippetUpdate;
		organizationId?: string;
	}) => Promise<null>;
	"snippets.list": (
		input: TaggedDocumentListInput,
	) => Promise<Page<BackendSnippet>>;
	"snippets.getAllKeywordSnippets": () => Promise<
		Array<{ id: string; keyword: string }>
	>;
	"snippets.getByTitle": (input: {
		title: string;
		limit?: number;
	}) => Promise<BackendSnippet[]>;
	"snippets.getOne": (input: { id: string }) => Promise<BackendSnippet>;
	"snippets.getTags": () => Promise<string[]>;
	"snippets.isKeywordAvailable": (input: {
		keyword: string;
		excludeId?: string;
	}) => Promise<boolean>;
	"snippets.pin": (input: { id: string }) => Promise<null>;
	"snippets.unpin": (input: { id: string }) => Promise<null>;
	"snippets.movePinnedUp": (input: { id: string }) => Promise<null>;
	"snippets.movePinnedDown": (input: { id: string }) => Promise<null>;
	"snippets.delete": (input: {
		id: string;
		organizationId?: string;
	}) => Promise<null>;
	"snippets.deleteAll": () => Promise<null>;
	"snippets.move": (input: {
		id: string;
		organizationId?: string;
		targetOrganizationHandle?: string;
	}) => Promise<null>;
	"quicklinks.pin": (input: { id: string }) => Promise<null>;
	"quicklinks.unpin": (input: { id: string }) => Promise<null>;
	"quicklinks.movePinnedUp": (input: { id: string }) => Promise<null>;
	"quicklinks.movePinnedDown": (input: { id: string }) => Promise<null>;
	"quicklinks.delete": (input: {
		id: string;
		organizationId?: string;
	}) => Promise<null>;
	"quicklinks.deleteAll": () => Promise<null>;
	"quicklinks.move": (input: {
		id: string;
		organizationId?: string;
		targetOrganizationHandle?: string;
	}) => Promise<null>;
	"snippets.updateAccessedAt": (input: { id: string }) => Promise<null>;
	"snippets.updateCopyCount": (input: { id: string }) => Promise<null>;
	"quicklinks.getQuicklink": (input: {
		id: string;
	}) => Promise<BackendQuicklink>;
	"quicklinks.getTags": () => Promise<string[]>;
	"quicklinks.listLibrary": () => Promise<QuicklinkLibraryEntry[]>;
	"quicklinks.update": (input: {
		id: string;
		organizationId?: string;
		update: QuicklinkUpdate;
	}) => Promise<null>;
	"quicklinks.updateOpenCount": (input: { id: string }) => Promise<null>;
	"quicklinks.save": (
		input: Omit<QuicklinkCreate, "id"> & {
			id?: string;
			organizationHandle?: string;
		},
	) => Promise<string>;
	"quicklinks.list": (
		input: TaggedDocumentListInput,
	) => Promise<Page<BackendQuicklink>>;
};

export const backendApiCatalog = catalog;
export type BackendMethod = keyof typeof backendApiCatalog.handlers;
type Namespace<P extends string> = P extends `${infer N}.${string}` ? N : never;
type Method<N extends string> = BackendMethod extends infer P
	? P extends `${N}.${infer M}`
		? M
		: never
	: never;

// Keep the complete catalog callable with unknown payloads; refine contracts
// when tooling uses them rather than reconstructing every bundled API
export type BackendClient = {
	[N in Namespace<BackendMethod>]: {
		[M in Method<N>]: `${N}.${M}` extends keyof ReviewedBackendContracts
			? ReviewedBackendContracts[`${N}.${M}`]
			: (input?: unknown) => Promise<unknown>;
	};
};
export type BackendTransport = (
	method: BackendMethod,
	input: unknown,
) => Promise<unknown>;

// Supply an established Raycast IPC transport; this does not start a backend
export function createBackendClient(
	transport: BackendTransport,
): BackendClient {
	const client: Record<
		string,
		Record<string, (input?: unknown) => Promise<unknown>>
	> = Object.create(null);
	for (const method of Object.keys(catalog.handlers) as BackendMethod[]) {
		const [namespace, name] = method.split(".");
		client[namespace] ??= Object.create(null);
		const group = client[namespace];
		group[name] = (input) => transport(method, input ?? null);
	}
	return client as unknown as BackendClient;
}

export function backendApi(filter = "") {
	return {
		release: catalog.release.version,
		handlers: Object.fromEntries(
			Object.entries(catalog.handlers).filter(([name]) =>
				name.includes(filter),
			),
		),
		unresolved: catalog.unresolved,
	};
}

export async function backendTrace(handler: string, filter = "") {
	const { default: evidence } = await import("../../data/source-effects.json", {
		with: { type: "json" },
	});
	if (evidence.release.hash !== catalog.release.hash)
		throw new Error(
			"Backend catalog and effect graph releases differ; regenerate source:api",
		);
	return traceEffects(
		evidence.functionGraph as Record<string, FunctionEvidence>,
		catalog.handlers as Record<string, HandlerEvidence>,
		handler,
		filter,
	);
}
