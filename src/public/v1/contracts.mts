/**
 * A JSON-serializable value; numbers must be finite
 * @public
 */
export type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { readonly [key: string]: JsonValue };

/**
 * Stored command settings returned by alias operations
 * @public
 */
export type CommandSettings = {
	id: string;
	extensionId: string;
	enabled: boolean;
	alias?: string | null;
	favoriteOrder?: number;
	fallbackOrder?: number;
	customSubtitle?: string;
	assumedViewKind?:
		| "List"
		| "Grid"
		| "Detail"
		| "Form"
		| "too dynamic to assume";
	updatedAt?: string;
	deviceGenerations?: string;
	localMeta?: Record<string, JsonValue> | null;
	syncedMeta?: Record<string, JsonValue> | null;
	macosSyncedMeta?: Record<string, JsonValue> | null;
	windowsSyncedMeta?: Record<string, JsonValue> | null;
	macosHotkey?: JsonValue;
	windowsHotkey?: JsonValue;
};

/**
 * Native database initialization diagnostics; extra fields are opaque
 * @public
 */
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

/**
 * Health and encryption state for each native database
 * @public
 */
export type DatabaseStatus = {
	allHealthy: boolean;
	databases: Array<{
		databaseType: string;
		fileExists: boolean;
		isAccessible: boolean;
		isEncrypted: boolean;
		createdFresh: boolean;
		backupAvailable: boolean;
		errorMessage?: string | null;
		migrationErrorKind?: string | null;
	}>;
};

/**
 * Required color roles in a Raycast theme
 * @public
 */
export type ThemeColor =
	| "background"
	| "backgroundSecondary"
	| "foreground"
	| "accent"
	| "selection"
	| "loader"
	| "red"
	| "orange"
	| "yellow"
	| "green"
	| "blue"
	| "purple"
	| "magenta";
/**
 * A named appearance with all colors specified as six-digit hex strings
 * @public
 */
export type Theme = {
	name: string;
	appearance: "light" | "dark";
	colors: Record<ThemeColor, string>;
};
/**
 * Validated configuration with defaults filled by parseConsumerConfig
 * @public
 */
export type ConsumerConfig = {
	profile?:
		| {
				currentUser: CurrentUser;
				avatarUrl?: string | undefined;
				avatarFile?: string | undefined;
		  }
		| {
				fallbackUser: CurrentUser;
				currentUserPatch: Record<string, unknown>;
				avatarUrl?: string | undefined;
				avatarFile?: string | undefined;
		  }
		| undefined;
	commandAliases: CommandAlias[];
	appAliases: {
		names: string[];
		alias: string;
		fallbackPath?: string | undefined;
		enabled: boolean;
	}[];
	themesFile?: string | undefined;
	disableAi: boolean;
	launch: boolean;
};
/**
 * Configuration outcome; applied is false only when a missing file is
 * skipped
 * @public
 */
export type ConfigureResult = {
	applied: boolean;
	configFile: string;
	warnings: string[];
};
/**
 * Public contract identifier, independent of the npm package version
 * @public
 */
export const API_VERSION = 1 as const;
/**
 * Mutation controls; dryRun defaults to false and skips writes and backups
 * @public
 */
export type MutationOptions = { dryRun?: boolean };
/**
 * Local profile data; id and name are required and extra fields are
 * preserved
 * @public
 */
export type CurrentUser = { id: string; name: string; [key: string]: unknown };
/**
 * Command alias input; null or an empty string removes the alias
 * @public
 */
export type CommandAlias = {
	id: string;
	extensionId: string;
	alias: string | null;
	enabled?: boolean | undefined;
};
/**
 * Alias state before the operation and actual or planned state afterward
 * @public
 */
export type AliasChange = {
	id: string;
	before: CommandSettings | null | undefined;
	after?: CommandSettings | null | undefined;
	plannedAfter?: CommandSettings;
};
/**
 * A stored preference decoded from JSON text when possible
 * @public
 */
export type UserDefaultResult = {
	key: string;
	storedType: string | null;
	value: unknown;
};
/**
 * Preference mutation result; previews use plannedAfter, writes use after
 * @public
 */
export type UserDefaultChange = {
	dryRun: boolean;
	key: string;
	action: "set" | "set-json" | "delete";
	before: unknown;
	after?: unknown;
	plannedAfter?: unknown;
	storedType?: string;
};
/**
 * Validated profile preview or stored profile after clearing session
 * defaults
 * @public
 */
export type ProfileResult =
	| { dryRun: true; profile: { currentUser: CurrentUser } }
	| { dryRun: false; summary: string; stored: CurrentUser };
/**
 * AI policy outcome; disable includes backup details and restore includes a
 * count
 * @public
 */
export type AiChangeResult = {
	dryRun: boolean;
	changes: Record<string, unknown>[];
	restored?: number;
	mode?: "disable";
	keyFile?: string | undefined;
	backup?: string;
	backupWritten?: boolean;
	operations?: number;
	status?: Record<string, unknown>;
};

// Methods validate inputs and own database lifetime
/**
 * Local operations that validate inputs and dispose their database
 * connections
 * @public
 */
export interface RaycastClient {
	readonly apiVersion: typeof API_VERSION;
	readonly database: {
		/**
		 * Inspect database initialization and health
		 */
		status(): Promise<{
			appSupport: string;
			keyFile: string | undefined;
			initReport: RaycastInitReport;
			status: DatabaseStatus;
		}>;
		/**
		 * Read an opaque diagnostic summary
		 */
		summary(): Promise<{
			appSupport: string;
			keyFile: string | undefined;
			summary: Record<string, unknown>;
		}>;
	};
	readonly profile: {
		/**
		 * Read local profile and OAuth values as opaque stored data
		 */
		get(): Promise<{ currentUser: unknown; oauthToken: unknown }>;
		/**
		 * Validate and store a profile, clearing local OAuth defaults on writes
		 */
		apply(
			currentUser: CurrentUser,
			options?: MutationOptions,
		): Promise<ProfileResult>;
	};
	readonly aliases: {
		/**
		 * Apply aliases in order; a failure can leave earlier writes applied
		 */
		apply(
			aliases: readonly CommandAlias[],
			options?: MutationOptions,
		): Promise<{ dryRun: boolean; aliases: AliasChange[] }>;
	};
	readonly userDefaults: {
		/**
		 * Read a preference; a missing value is null
		 */
		get(key: string): Promise<UserDefaultResult>;
		/**
		 * Store a string, finite number, or boolean
		 */
		set(
			key: string,
			value: string | number | boolean,
			options?: MutationOptions,
		): Promise<UserDefaultChange>;
		/**
		 * Validate and serialize JSON into a stored string
		 */
		setJson(
			key: string,
			value: JsonValue,
			options?: MutationOptions,
		): Promise<UserDefaultChange>;
		/**
		 * Remove a preference; a preview reports plannedAfter as null
		 */
		delete(key: string, options?: MutationOptions): Promise<UserDefaultChange>;
	};
	readonly themes: {
		/**
		 * Upsert and select themes without restarting; changed means would change in
		 * a preview
		 */
		apply(
			themes: readonly Theme[],
			options?: MutationOptions,
		): Promise<ThemeChangeResult>;
	};
	readonly ai: {
		/**
		 * Read opaque AI policy diagnostics
		 */
		status(): Promise<Record<string, unknown>>;
		/**
		 * Back up current values and apply the bundled AI policy
		 */
		disable(options?: MutationOptions): Promise<AiChangeResult>;
		/**
		 * Restore values from the existing AI policy backup
		 */
		restore(options?: MutationOptions): Promise<AiChangeResult>;
	};
}

/**
 * Theme outcome; changed reports actual writes or proposed changes in a
 * preview
 * @public
 */
export type ThemeChangeResult = { dryRun: boolean; changed: boolean };
