import {
	addonSurface,
	databaseMethodSurface,
} from "../../features/database/inspect.mts";
import { parseProfilePayload } from "../../features/profile/profile.mts";
import { backendApi, backendTrace } from "../../native/backend.mts";
import { builtinApi } from "../../native/builtins.mts";
import {
	callDatabaseMethod,
	checkNativeCompatibility,
	databaseApi,
	isDatabaseMethodPath,
} from "../../native/database-api.mts";
import { withDatabase } from "../../platform/database.mts";
import { createRaycastClient } from "../../public/v1/index.mts";
import { IO, runtimeReport } from "../../shared/config.mts";

const client = createRaycastClient();

type Flags = { dryRun: boolean; positionals: string[]; undefinedArgs?: string };

type Command = {
	help: string;
	usage?: string;
	run: (flags: Flags) => unknown | Promise<unknown>;
};

function parseJsonArgs(value: string | undefined): unknown[] {
	if (value === undefined) return [];
	const parsed: unknown = JSON.parse(value);
	if (!Array.isArray(parsed))
		throw new Error("method args must be a JSON array");
	return parsed;
}

const COMMANDS = new Map<string, Command>(
	Object.entries({
		trace: {
			help: "Trace a backend handler to native calls and host effects",
			run: ({ positionals }) => backendTrace(positionals[0], positionals[1]),
		},
		"builtin-api": {
			help: "List built-in extensions, command IDs, and preferences",
			run: ({ positionals }) => builtinApi(positionals[0]),
		},
		"backend-api": {
			help: "List backend handlers and their source locations",
			run: ({ positionals }) => backendApi(positionals[0]),
		},
		api: {
			help: "List the extracted database API and observed call arities",
			run: ({ positionals }) => databaseApi(positionals[0]),
		},
		compatibility: {
			help: "Compare the installed native addon with the recorded interface",
			run: () => checkNativeCompatibility(),
		},
		runtime: {
			help: "Print the Node/TypeScript contract these scripts were checked against.",
			run: () => runtimeReport(),
		},
		surface: {
			help: "Print native addon exports and repository methods without opening the DB.",
			run: () => addonSurface(),
		},
		status: {
			help: "Print database initialization and health status.",
			run: () => client.database.status(),
		},
		summary: {
			help: "Print concise counts/settings",
			run: () => client.database.summary(),
		},
		methods: {
			help: "Print callable DatabaseClient and repository methods.",
			run: () => withDatabase(async ({ db }) => databaseMethodSurface(db)),
		},
		call: {
			help: "Invoke any DatabaseClient/repository method with JSON positional args.",
			usage: "call <method.path> [json-args] [--dry-run]",
			run: async ({ dryRun, positionals, undefinedArgs }: Flags) => {
				const [methodPath, jsonArgs, ...unexpected] = positionals;
				if (!methodPath || unexpected.length > 0) {
					throw new Error("usage: call <method.path> [json-args]");
				}
				if (!isDatabaseMethodPath(methodPath))
					throw new Error(`unknown database method: ${methodPath}`);
				const args = parseJsonArgs(jsonArgs);
				const undefinedIndexes =
					undefinedArgs === undefined
						? []
						: undefinedArgs.split(",").map((index) => {
								if (
									!/^(0|[1-9][0-9]*)$/.test(index) ||
									Number(index) >= args.length
								)
									throw new Error(
										"undefined-args must contain indexes into the JSON argument array",
									);
								return Number(index);
							});
				for (const index of undefinedIndexes) args[index] = undefined;
				const argumentInfo = { args, undefinedArgs: undefinedIndexes };
				if (dryRun) return { dryRun, method: methodPath, ...argumentInfo };
				return withDatabase(async ({ db }) => {
					return {
						method: methodPath,
						...argumentInfo,
						result: await callDatabaseMethod(db, methodPath, ...args),
					};
				});
			},
		},
		profile: {
			help: "Print the profile defaults or apply a local user without a session token.",
			usage: "profile <get|apply <current-user-json>> [--dry-run]",
			run: async ({ dryRun, positionals }: Flags) => {
				const [action, currentUser, ...unexpected] = positionals;
				if (unexpected.length > 0)
					throw new Error("too many profile arguments");
				if (!action) return client.profile.get();
				if (action !== "apply")
					throw new Error(`unknown profile action: ${action}`);
				const profile = parseProfilePayload(currentUser);
				return client.profile.apply(profile.currentUser, { dryRun });
			},
		},
		aliases: {
			help: "Upsert command aliases from JSON.",
			usage: "aliases apply <aliases-json> [--dry-run]",
			run: async ({ dryRun, positionals }: Flags) => {
				const [action, payload, ...unexpected] = positionals;
				if (action !== "apply" || !payload || unexpected.length > 0) {
					throw new Error("usage: aliases apply <aliases-json> [--dry-run]");
				}
				return client.aliases.apply(JSON.parse(payload), { dryRun });
			},
		},
		"user-default": {
			help: "Get/delete a default; set text writes text, set json writes JSON text, set value writes a native primitive.",
			usage:
				"user defaults <get|delete|set <text|json|value>> <key> [value] [--dry-run]",
			run: async ({ dryRun, positionals }: Flags) => {
				const [action, key, value] = positionals;
				if (!key) throw new Error("user defaults requires a key");
				if (action === "get" || action === "delete") {
					if (value !== undefined)
						throw new Error(`too many user defaults ${action} arguments`);
					return action === "get"
						? client.userDefaults.get(key)
						: client.userDefaults.delete(key, { dryRun });
				}
				if (value === undefined)
					throw new Error("user defaults requires a value");
				if (action === "set")
					return client.userDefaults.set(key, value, { dryRun });
				if (action === "set-json")
					return client.userDefaults.setJson(key, JSON.parse(value), {
						dryRun,
					});
				if (action === "set-value")
					return client.userDefaults.set(key, JSON.parse(value), { dryRun });
				throw new Error(`unknown user defaults action: ${action}`);
			},
		},
	} satisfies Record<string, Command>),
);

export async function runDatabaseCommand(
	commandName: string,
	flags: Flags,
): Promise<void> {
	const command = COMMANDS.get(commandName);
	if (!command) throw new Error(`unknown command: ${commandName}`);
	const result = await command.run(flags);
	if (result !== undefined) console.log(beautify(result, null, IO.JSON_INDENT));
}

import beautify from "json-beautify";
