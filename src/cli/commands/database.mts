import { parseProfilePayload } from "../../features/profile/profile.mts";
import { builtinApi } from "../../native/builtins.mts";
import { createRaycastClient } from "../../public/v1/index.mts";
import { IO, runtimeReport } from "../../shared/config.mts";

const client = createRaycastClient();

type Flags = { dryRun: boolean; positionals: string[] };

type Command = {
	help: string;
	usage?: string;
	run: (flags: Flags) => unknown | Promise<unknown>;
};

const COMMANDS = new Map<string, Command>(
	Object.entries({
		"builtin-api": {
			help: "List built-in extensions, command IDs, and preferences",
			run: ({ positionals }) => builtinApi(positionals[0]),
		},
		runtime: {
			help: "Print the Node/TypeScript contract these scripts were checked against.",
			run: () => runtimeReport(),
		},
		status: {
			help: "Print database initialization and health status.",
			run: () => client.database.status(),
		},
		summary: {
			help: "Print concise counts/settings",
			run: () => client.database.summary(),
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
	if (result !== undefined)
		console.log(JSON.stringify(result, null, IO.JSON_INDENT));
}
