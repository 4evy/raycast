#!/usr/bin/env node
import process from "node:process";
import {
	buildApplication,
	buildCommand,
	buildRouteMap,
	run,
} from "@stricli/core";
import { extractDatabaseKey } from "../public/v1/index.mts";
import { runAi } from "./commands/ai.mts";
import { runConfigure } from "./commands/configure.mts";
import { runDatabaseCommand } from "./commands/database.mts";
import { runThemes } from "./commands/themes.mts";

const string = (value: string) => value;
const dryRun = {
	kind: "boolean",
	brief: "Show planned changes without writing them",
	default: false,
	withNegated: false,
} as const;

function dbCommand(
	name: string,
	brief: string,
	minimum = 0,
	maximum = 0,
	usage?: string,
	prefix: string[] = [],
) {
	if (maximum === 0)
		return buildCommand({
			func: async (flags: { dryRun: boolean }) =>
				runDatabaseCommand(name, { ...flags, positionals: prefix }),
			parameters: { flags: { dryRun } },
			docs: { brief },
		});
	return buildCommand({
		func: async (flags: { dryRun: boolean }, ...positionals: string[]) =>
			runDatabaseCommand(name, {
				...flags,
				positionals: [...prefix, ...positionals],
			}),
		parameters: {
			flags: { dryRun },
			positional: {
				kind: "array",
				parameter: { brief: "Command argument", parse: string },
				minimum,
				maximum,
			},
		},
		docs: { brief, ...(usage ? { customUsage: [usage] } : {}) },
	});
}

const db = buildRouteMap({
	routes: {
		trace: dbCommand(
			"trace",
			"Trace backend handler effects with source locations",
			1,
			2,
			"<handler> [effect]",
		),
		api: buildRouteMap({
			routes: {
				builtin: dbCommand(
					"builtin-api",
					"List built-in commands and preferences",
					0,
					1,
					"[filter]",
				),
				backend: dbCommand(
					"backend-api",
					"List backend request handlers",
					0,
					1,
					"[filter]",
				),
				native: dbCommand(
					"api",
					"List database interfaces and call evidence",
					0,
					1,
					"[filter]",
				),
			},
			docs: { brief: "Inspect Raycast API catalogs" },
		}),
		compatibility: dbCommand(
			"compatibility",
			"Check installed native API compatibility",
		),
		runtime: dbCommand("runtime", "Show the checked Raycast runtime contract"),
		surface: dbCommand("surface", "Show native addon exports"),
		status: dbCommand("status", "Show database status"),
		summary: dbCommand("summary", "Show database settings and counts"),
		methods: dbCommand("methods", "List callable database methods"),
		call: buildCommand({
			func: async (
				flags: { dryRun: boolean; undefinedArgs?: string },
				...positionals: string[]
			) => runDatabaseCommand("call", { ...flags, positionals }),
			parameters: {
				flags: {
					dryRun,
					undefinedArgs: {
						kind: "parsed",
						parse: string,
						optional: true,
						brief:
							"Comma-separated zero-based argument indexes to pass as undefined",
					},
				},
				positional: {
					kind: "array",
					parameter: {
						brief: "Method path and optional JSON argument array",
						parse: string,
					},
					minimum: 1,
					maximum: 2,
				},
			},
			docs: { brief: "Call a database method with JSON arguments" },
		}),
		profile: buildRouteMap({
			routes: {
				get: dbCommand("profile", "Show profile defaults"),
				apply: dbCommand(
					"profile",
					"Apply profile defaults",
					1,
					1,
					"<current-user-json> [--dry-run]",
					["apply"],
				),
			},
			docs: { brief: "Show or apply profile defaults" },
		}),
		aliases: buildRouteMap({
			routes: {
				apply: dbCommand(
					"aliases",
					"Apply command aliases from JSON",
					1,
					1,
					"<aliases-json> [--dry-run]",
					["apply"],
				),
			},
			docs: { brief: "Manage command aliases" },
		}),
		user: buildRouteMap({
			routes: {
				defaults: buildRouteMap({
					routes: {
						get: dbCommand(
							"user-default",
							"Get a user default",
							1,
							1,
							"<key>",
							["get"],
						),
						delete: dbCommand(
							"user-default",
							"Delete a user default",
							1,
							1,
							"<key> [--dry-run]",
							["delete"],
						),
						set: buildRouteMap({
							routes: {
								text: dbCommand(
									"user-default",
									"Store text",
									2,
									2,
									"<key> <value> [--dry-run]",
									["set"],
								),
								json: dbCommand(
									"user-default",
									"Store serialized JSON",
									2,
									2,
									"<key> <json> [--dry-run]",
									["set-json"],
								),
								value: dbCommand(
									"user-default",
									"Store a native string, number, or boolean",
									2,
									2,
									"<key> <json-primitive> [--dry-run]",
									["set-value"],
								),
							},
							docs: { brief: "Set a user default" },
						}),
					},
					docs: { brief: "Get, set, or delete user defaults" },
				}),
			},
			docs: { brief: "Manage local user settings" },
		}),
	},
	docs: { brief: "Inspect and change Raycast's local database" },
});

const app = buildApplication(
	buildRouteMap({
		routes: {
			configure: buildCommand({
				func: async (flags: { ifPresent: boolean }, configFile: string) =>
					runConfigure(configFile, flags.ifPresent),
				parameters: {
					flags: {
						ifPresent: {
							kind: "boolean",
							brief: "Skip when the consumer config is absent",
							default: false,
							withNegated: false,
						},
					},
					positional: {
						kind: "tuple",
						parameters: [{ brief: "Consumer config JSON file", parse: string }],
					},
				},
				docs: { brief: "Apply consumer supplied Raycast configuration" },
			}),
			key: buildRouteMap({
				routes: {
					extract: buildCommand({
						func: async () => {
							const { stdout, stderr } = await extractDatabaseKey();
							process.stdout.write(stdout);
							process.stderr.write(stderr);
						},
						parameters: {},
						docs: { brief: "Extract Raycast's local database key" },
					}),
				},
				docs: { brief: "Manage the local database key" },
			}),
			themes: buildCommand({
				func: async (_flags: Record<string, never>, file: string) =>
					runThemes(file),
				parameters: {
					flags: {},
					positional: {
						kind: "tuple",
						parameters: [{ brief: "Themes JSON file", parse: string }],
					},
				},
				docs: { brief: "Install and select consumer supplied themes" },
			}),
			ai: buildRouteMap({
				routes: {
					status: buildCommand({
						func: async () => runAi("status"),
						parameters: {},
						docs: { brief: "Show current AI settings" },
					}),
					disable: buildCommand({
						func: async (flags: { dryRun: boolean }) => runAi("disable", flags),
						parameters: { flags: { dryRun } },
						docs: { brief: "Back up and disable Raycast AI settings" },
					}),
					restore: buildCommand({
						func: async (flags: { dryRun: boolean }) => runAi("restore", flags),
						parameters: { flags: { dryRun } },
						docs: { brief: "Restore AI settings from the backup" },
					}),
				},
				docs: { brief: "Inspect, disable, or restore Raycast AI settings" },
			}),
			db,
		},
		docs: { brief: "Manage the local Raycast profile" },
	}),
	{
		name: "raycast",
		scanner: {
			caseStyle: "allow-kebab-for-camel",
			allowArgumentEscapeSequence: true,
		},
	},
);

await run(app, process.argv.slice(2), {
	process: {
		stdout: process.stdout,
		stderr: process.stderr,
		env: process.env,
		get exitCode() {
			return process.exitCode ?? null;
		},
		set exitCode(value: number | string | null) {
			process.exitCode = value;
		},
	},
});
