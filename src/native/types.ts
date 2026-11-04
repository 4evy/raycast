// Reviewed contracts for the AI controls and configuration operations we use
// The native addon exposes more methods that intentionally remain out of scope

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
	macosHotkey?: JsonValue;
	windowsHotkey?: JsonValue;
};

// Null clears an existing command alias
export type CommandSettingsUpdate = {
	enabled?: boolean;
	alias?: string | null;
};
export type CommandSettingsCreate = Pick<
	CommandSettings,
	"id" | "extensionId" | "enabled"
> &
	Omit<CommandSettingsUpdate, "enabled">;

export type AiModel = {
	id: string;
	disabledAt?: string | undefined;
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

export type GeneralSettings = {
	appearance: "system" | "light" | "dark";
	themeDarkId?: string;
	themeLightId?: string;
};

export type GeneralSettingUpdate = {
	type: "ThemeDarkId" | "ThemeLightId";
	value: string;
};

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
};

export type RaycastUserDefaultsRepository = {
	get: (key: string) => Promise<string | number | boolean | null>;
	set: (key: string, value: string | number | boolean) => Promise<void>;
	delete: (key: string) => Promise<void>;
};

export type SettingsRepository = {
	allThemes: () => Promise<ThemeRecord[]>;
	addTheme: (theme: ThemeCreate) => Promise<ThemeRecord>;
	updateTheme: (id: string, theme: ThemeCreate) => Promise<ThemeRecord | null>;

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
	getGeneralSettings: () => Promise<GeneralSettings>;
};

export type AiRepository = {
	modelGetAll: () => Promise<AiModel[]>;
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
	scheduledMessageGetAll: () => Promise<unknown[]>;
	folderGetAll: () => Promise<unknown[]>;
};

export type FrecencyRepository = {
	getAll: () => Promise<FrecencyScore[]>;
	getRecords: () => Promise<FrecencyRecord[]>;
	reset: (itemId: string) => Promise<void>;
	insertMany: (records: FrecencyRecord[]) => Promise<void>;
};

export type RaycastDatabaseClient = {
	initReport: RaycastInitReport;
	userDefaults: RaycastUserDefaultsRepository;
	settings: SettingsRepository;
	ai: AiRepository;
	frecency: FrecencyRepository;
	appIndex: {
		getAllByContentType: (contentType: number) => Promise<unknown>;
	};
	orgPacks: {
		listOrgSkills: () => Promise<unknown[]>;
		listOrgAiAgents: () => Promise<unknown[]>;
	};
	getDatabaseStatus: () => DatabaseStatus;
	shutdown: () => Promise<void>;
};

export type RaycastNativeAddon = {
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

export type DatabaseKind =
	| "Ai"
	| "AppIndex"
	| "Clipboard"
	| "Emoji"
	| "Frecency"
	| "Main"
	| "NodeExtensions"
	| "Screenshots"
	| "Settings"
	| "SettingsV2"
	| "UserActivity";

export type MigrationErrorKind =
	| "Config"
	| "Connection"
	| "Divergent"
	| "InvalidFile"
	| "InvalidName"
	| "InvalidPath"
	| "InvalidVersion"
	| "Missing"
	| "Repeated";

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
		migrationErrorKind?: MigrationErrorKind | null;
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
