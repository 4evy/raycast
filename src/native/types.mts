import type { CalculatorRepository } from "./calculator.mts";
import type { KeyboardShortcut } from "./keyboard.mts";
import type { TranslateCustomCommandsRepository } from "./translator.mts";
import type { WindowManagementRepository } from "./window-management.mts";
import type { WindowsRunCommandsRepository } from "./windows-run.mts";

export type {
	KeyboardKey,
	KeyboardModifier,
	KeyboardShortcut,
	KeyboardShortcutKind,
	SingleKeyShortcut,
	SingleStepShortcut,
} from "./keyboard.mts";

import type {
	NotesRepository,
	QuicklinksRepository,
	SnippetsRepository,
} from "../features/documents/repositories.mts";
import type {
	DatabaseKind,
	GeneralSettingsColumn,
	NativeAddon,
	NativeAiRepository,
	NativeDatabaseClient,
	NativeDatabaseSnapshot,
	NativeFrecencyRepository,
	NativeSettingsRepository,
	NativeUserDefaultsRepository,
} from "./generated.mts";

export type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { readonly [key: string]: JsonValue };

export type InternalExtensionSettings = {
	id: string;
	enabled: boolean;
	enabledFallbackCommandIds?: string[];
	syncedMeta?: Record<string, JsonValue> | null;
	localMeta?: Record<string, JsonValue> | null;
	macosSyncedMeta?: Record<string, JsonValue> | null;
	windowsSyncedMeta?: Record<string, JsonValue> | null;
	updatedAt?: string;
	deprecatedMeta?: JsonValue | null;
};

export const THEME_COLOR_FIELDS = [
	"background",
	"backgroundSecondary",
	"foreground",
	"accent",
	"selection",
	"loader",
	"red",
	"orange",
	"yellow",
	"green",
	"blue",
	"purple",
	"magenta",
] as const;
export type ThemeColorField = (typeof THEME_COLOR_FIELDS)[number];
export type ThemeCreate = Record<ThemeColorField, string> & {
	name: string;
	appearance: "light" | "dark";
};
export type ThemeRecord = ThemeCreate & {
	id: string;
	createdAt: string;
	updatedAt: string;
};

export type CommandViewKind =
	| "List"
	| "Grid"
	| "Detail"
	| "Form"
	| "too dynamic to assume";

export type CommandSettings = {
	id: string;
	extensionId: string;
	enabled: boolean;
	alias?: string;
	favoriteOrder?: number;
	fallbackOrder?: number;
	customSubtitle?: string;
	assumedViewKind?: CommandViewKind;
	updatedAt?: string;
	deviceGenerations?: string;
	localMeta?: Record<string, JsonValue> | null;
	syncedMeta?: Record<string, JsonValue> | null;
	macosSyncedMeta?: Record<string, JsonValue> | null;
	windowsSyncedMeta?: Record<string, JsonValue> | null;
	macosHotkey?: KeyboardShortcut | null;
	windowsHotkey?: KeyboardShortcut | null;
};

// Null clears alias and ranking fields; metadata objects merge by key
// Subtitle and view-kind updates require strings, including an empty subtitle
export type CommandSettingsUpdate = {
	[K in keyof Omit<CommandSettings, "id" | "extensionId" | "updatedAt">]?:
		| CommandSettings[K]
		| (K extends "alias" | "favoriteOrder" | "fallbackOrder" ? null : never)
		| undefined;
};
export type CommandSettingsCreate = Pick<
	CommandSettings,
	"id" | "extensionId" | "enabled"
> &
	Omit<CommandSettingsUpdate, "enabled">;

export type AiModel = {
	id: string;
	name: string;
	provider: string;
	providerBrand: string;
	providerName: string;
	model: string;
	data: Record<string, JsonValue>;
	disabledAt?: string | undefined;
	archivedAt?: string | undefined;
	updatedAt: string;
};

// Raw storage records are the input to insertMany and preserve ranking history
export type FrecencyRecord = {
	itemId: string;
	frecencyDate: number;
	searchTerms?: string | undefined;
	openedAt?: string | undefined;
};

// Ranking queries return a computed score and decoded search terms
export type FrecencyScore = {
	itemId: string;
	score: number;
	searchTerms?: string[];
	openedAt?: string | undefined;
};

// Setting value enums follow the backend import schema at line 352971
export type GeneralSettings = {
	openAtLogin: boolean;
	showInMenuBar: boolean;
	appearance: "system" | "light" | "dark";
	windowMode: "compact" | "expanded";
	windowPresentationMode: "mouse-screen" | "active-screen" | "primary-screen";
	windowActivationBehavior: "move-to-active-space" | "switch-space";
	globalHotkey: KeyboardShortcut;
	themeDarkId?: string;
	themeLightId?: string;
	faviconProvider?: import("./generated.mts").FaviconProvider;
	popToRootTimeout: number;
	escapeKeyBehavior: "pop-back-or-close" | "close-and-pop-to-root";
	escapeKeyClosesWindow: boolean;
	navigationBindings: "emacs" | "vim-motions";
	pageNavigationKeys: "square-brackets" | "arrow-keys";
	useSystemProxySettings: boolean;
	additionalCertificateAuthorities: string[];
	enforcedInputSourceId?: string;
	rootSearchSensitivity: "low" | "medium" | "high";
	tidyMenuBar: boolean;
	builtinHotkeysPreset: "legacy" | "improved";
	uiZoom: number;
	hyperKeyCode?: import("./generated.mts").HyperKeyCode;
	hyperKeyIncludeShift: boolean;
	hyperKeyCapsLockAction?: import("./generated.mts").HyperKeyCapsLockAction;
	hyperKeyDisplayShortcut: boolean;
	useSpotlightGesture: boolean;
	openFoldersInTabs: boolean;
	showFavoritesInCompactMode: boolean;
};

export type GeneralSettingUpdate = {
	[K in GeneralSettingsColumn]: {
		type: K;
		value: GeneralSettings[Uncapitalize<K>];
	};
}[GeneralSettingsColumn];

export type RaycastInitReport = {
	overallSuccess: boolean;
	postInitHooksCompleted: boolean;
	postInitHooksErrorMessage?: string | null;
	totalDurationMs: number;
	warnings: string[];
	databaseResults: Array<{
		databaseType: string;
		success: boolean;
		existedInitially: boolean;
		existsNow: boolean;
		wasEncryptedInitially: boolean;
		isNowEncrypted: boolean;
		errorMessage?: string | null;
	}>;
	[key: string]: unknown;
};

type RaycastUserDefaultsRepositoryContract = {
	get: (key: string) => Promise<string | number | boolean | null>;
	set: (key: string, value: string | number | boolean) => Promise<void>;
	delete: (key: string) => Promise<void>;
};

type SettingsRepositoryContract = {
	allThemes: () => Promise<ThemeRecord[]>;
	// Missing IDs return null; backend theme handlers throw instead
	getTheme: (id: string) => Promise<ThemeRecord | null>;
	addTheme: (theme: ThemeCreate) => Promise<ThemeRecord>;
	updateTheme: (id: string, theme: ThemeCreate) => Promise<ThemeRecord | null>;
	deleteTheme: (id: string) => Promise<void>;

	addInternalExtensionSettings: (
		settings: Record<string, unknown>,
	) => Promise<void>;
	deleteInternalExtensionSettings: (id: string) => Promise<void>;
	getInternalExtensionSettings: (
		id: string,
	) => Promise<InternalExtensionSettings | null>;
	updateInternalExtensionSettings: (
		id: string,
		settings: Record<string, unknown>,
	) => Promise<void>;
	allInternalExtensionsSettings: () => Promise<InternalExtensionSettings[]>;
	getCommandSettings: (id: string) => Promise<CommandSettings | null>;
	updateCommandSettings: (
		id: string,
		settings: CommandSettingsUpdate,
	) => Promise<void>;
	addCommandSettings: (settings: CommandSettingsCreate) => Promise<void>;
	allCommandSettings: () => Promise<CommandSettings[]>;
	allMcpServers: () => Promise<unknown[]>;
	updateGeneralSetting: (setting: GeneralSettingUpdate) => Promise<void>;
	deleteCommandSettings: (id: string) => Promise<void>;
	allCommandSettingsForExtension: (
		extensionId: string,
	) => Promise<CommandSettings[]>;
	getGeneralSettings: () => Promise<GeneralSettings>;
};

type AiRepositoryContract = {
	modelGetAll: () => Promise<AiModel[]>;
	modelGetById: (id: string) => Promise<AiModel | null>;
	modelUpsertOne: (model: AiModel) => Promise<void>;
	modelSetDisabledAt: (
		id: string,
		disabledAt: string | undefined,
	) => Promise<void>;
	chatGetAllIds: () => Promise<unknown[]>;
	chatGetAllInvalidationSnapshots: () => Promise<unknown[]>;
	commandGetAll: () => Promise<unknown[]>;
	modeGetAll: () => Promise<unknown[]>;
	transcriptionGetAll: () => Promise<unknown[]>;
	transcriptionStyleGetAll: () => Promise<unknown[]>;
};

type FrecencyRepositoryContract = {
	getAll: () => Promise<FrecencyScore[]>;
	getRecords: () => Promise<FrecencyRecord[]>;
	getAllByIds: (ids: string[]) => Promise<FrecencyScore[]>;
	visit: (
		itemId: string,
		visitDateMs: number,
		searchTerm?: string,
	) => Promise<FrecencyScore>;
	search: (query: string, samplingDateMs: number) => Promise<FrecencyScore[]>;
	reset: (itemId: string) => Promise<void>;
	insertMany: (records: FrecencyRecord[]) => Promise<void>;
};

type RaycastDatabaseClientContract = {
	translateCustomCommands: TranslateCustomCommandsRepository;
	windowManagement: WindowManagementRepository;
	windowsRunCommands: WindowsRunCommandsRepository;
	calculator: CalculatorRepository;
	notes: NotesRepository;
	snippets: SnippetsRepository;
	quicklinks: QuicklinksRepository;
	initReport: RaycastInitReport;
	userDefaults: RaycastUserDefaultsRepository;
	settings: SettingsRepository;
	ai: AiRepository;
	frecency: FrecencyRepository;
	getDatabaseStatus: () => DatabaseStatus;
	openDatabaseSnapshot: () => RaycastDatabaseSnapshot;
	setDeviceId: (id: string) => void;
	resetDatabase: (kind: DatabaseKind) => void;
	restoreFromBackup: (kind: DatabaseKind) => void;
	shutdown: () => Promise<void>;
};

type RaycastNativeAddonContract = {
	DatabaseClient: new (
		appSupport: string,
		key: string,
		logger: RaycastLogger,
	) => RaycastDatabaseClient;
};

export type RaycastDatabaseContext = AsyncDisposable & {
	db: RaycastDatabaseClient;
	appSupport: string;
	keyFile: string | undefined;
};

export type DatabaseStatus = {
	allHealthy: boolean;
	databases: Array<{
		databaseType: DatabaseKind;
		fileExists: boolean;
		isAccessible: boolean;
		isEncrypted: boolean;
		createdFresh: boolean;
		backupAvailable: boolean;
		errorMessage?: string | null;
		migrationErrorKind?: import("./generated.mts").MigrationErrorKind | null;
	}>;
};

export type RaycastLogger = (
	error: unknown,
	entry: {
		level: string;
		message: string;
		metadata?: unknown;
	},
) => void;

type Refine<Base, Contract> = Omit<Base, keyof Contract> & Contract;
export type SettingsRepository = Refine<
	NativeSettingsRepository,
	SettingsRepositoryContract
>;
export type AiRepository = Refine<NativeAiRepository, AiRepositoryContract>;
export type FrecencyRepository = Refine<
	NativeFrecencyRepository,
	FrecencyRepositoryContract
>;
export type RaycastUserDefaultsRepository = Refine<
	NativeUserDefaultsRepository,
	RaycastUserDefaultsRepositoryContract
>;
export type RaycastDatabaseClient = Refine<
	NativeDatabaseClient,
	RaycastDatabaseClientContract
>;
export type RaycastNativeAddon = Refine<
	NativeAddon,
	RaycastNativeAddonContract
>;
export type RaycastDatabaseSnapshot = Refine<
	NativeDatabaseSnapshot,
	{
		[K in Extract<
			keyof NativeDatabaseSnapshot,
			keyof RaycastDatabaseClient
		>]: RaycastDatabaseClient[K];
	} & { release: () => void }
>;
