#!/usr/bin/env node
import process from "node:process";
import { object, or, tuple } from "@optique/core/constructs";
import { message, text } from "@optique/core/message";
import { map, multiple, withDefault } from "@optique/core/modifiers";
import type { NonEmptyString } from "@optique/core/nonempty";
import { argument, command, constant, flag } from "@optique/core/primitives";
import { string } from "@optique/core/valueparser";
import { run } from "@optique/run";
import { extractDatabaseKey } from "../public/v1/index.mts";
import { runAi } from "./commands/ai.mts";
import { runConfigure } from "./commands/configure.mts";
import { runDatabaseCommand } from "./commands/database.mts";
import { runThemes } from "./commands/themes.mts";

const dryRun = withDefault(
	flag("--dry-run", {
		description: message`Show planned changes without writing them`,
	}),
	false,
);

function positional(name: NonEmptyString, description = "Command argument") {
	return argument(string({ metavar: name }), {
		description: message`${text(description)}`,
	});
}

function dbCommand(
	name: string,
	brief: string,
	arguments_: readonly NonEmptyString[] = [],
	prefix: readonly string[] = [],
	optional = false,
) {
	return map(
		object(brief, {
			dryRun,
			positionals: optional
				? multiple(positional(arguments_[0] ?? "argument"), { max: 1 })
				: tuple(arguments_.map((name) => positional(name))),
		}),
		({ dryRun, positionals }) =>
			() =>
				runDatabaseCommand(name, {
					dryRun,
					positionals: [...prefix, ...positionals],
				}),
	);
}

const db = command(
	"db",
	or(
		command(
			"api",
			command(
				"builtin",
				dbCommand(
					"builtin-api",
					"List built-in commands and preferences",
					["filter"],
					[],
					true,
				),
				{ description: message`List built-in commands and preferences` },
			),
			{
				description: message`Find built-in command IDs and configuration preferences`,
			},
		),
		command(
			"runtime",
			dbCommand("runtime", "Show the checked Raycast runtime contract"),
			{
				description: message`Show the checked Raycast runtime contract`,
			},
		),
		command("status", dbCommand("status", "Show database status"), {
			description: message`Show database status`,
		}),
		command(
			"summary",
			dbCommand("summary", "Show database settings and counts"),
			{
				description: message`Show database settings and counts`,
			},
		),
		command(
			"profile",
			or(
				command("get", dbCommand("profile", "Show profile defaults"), {
					description: message`Show profile defaults`,
				}),
				command(
					"apply",
					dbCommand(
						"profile",
						"Apply profile defaults",
						["current-user-json"],
						["apply"],
					),
					{
						description: message`Apply profile defaults`,
					},
				),
			),
			{ description: message`Show or apply profile defaults` },
		),
		command(
			"aliases",
			command(
				"apply",
				dbCommand(
					"aliases",
					"Apply command aliases from JSON",
					["aliases-json"],
					["apply"],
				),
				{
					description: message`Apply command aliases from JSON`,
				},
			),
			{ description: message`Manage command aliases` },
		),
		command(
			"user",
			command(
				"defaults",
				or(
					command(
						"get",
						dbCommand("user-default", "Get a user default", ["key"], ["get"]),
						{
							description: message`Get a user default`,
						},
					),
					command(
						"delete",
						dbCommand(
							"user-default",
							"Delete a user default",
							["key"],
							["delete"],
						),
						{
							description: message`Delete a user default`,
						},
					),
					command(
						"set",
						or(
							command(
								"text",
								dbCommand(
									"user-default",
									"Store text",
									["key", "value"],
									["set"],
								),
								{
									description: message`Store text`,
								},
							),
							command(
								"json",
								dbCommand(
									"user-default",
									"Store serialized JSON",
									["key", "json"],
									["set-json"],
								),
								{
									description: message`Store serialized JSON`,
								},
							),
							command(
								"value",
								dbCommand(
									"user-default",
									"Store a native string, number, or boolean",
									["key", "json-primitive"],
									["set-value"],
								),
								{
									description: message`Store a native string, number, or boolean`,
								},
							),
						),
						{ description: message`Set a user default` },
					),
				),
				{ description: message`Get, set, or delete user defaults` },
			),
			{ description: message`Manage local user settings` },
		),
	),
	{ description: message`Inspect and change Raycast's local database` },
);

const app = or(
	command(
		"configure",
		map(
			object({
				ifPresent: withDefault(
					flag("--if-present", {
						description: message`Skip when the consumer config is absent`,
					}),
					false,
				),
				configFile: positional("config-file", "Consumer config JSON file"),
			}),
			({ configFile, ifPresent }) =>
				() =>
					runConfigure(configFile, ifPresent),
		),
		{ description: message`Apply consumer supplied Raycast configuration` },
	),
	command(
		"key",
		command(
			"extract",
			constant(async () => {
				const { stdout, stderr } = await extractDatabaseKey();
				process.stdout.write(stdout);
				process.stderr.write(stderr);
			}),
			{ description: message`Extract Raycast's local database key` },
		),
		{ description: message`Manage the local database key` },
	),
	command(
		"themes",
		map(
			positional("file", "Themes JSON file"),
			(file) => () => runThemes(file),
		),
		{ description: message`Install and select consumer supplied themes` },
	),
	command(
		"ai",
		or(
			command(
				"status",
				constant(() => runAi("status")),
				{
					description: message`Show current AI settings`,
				},
			),
			command(
				"disable",
				map(object({ dryRun }), (flags) => () => runAi("disable", flags)),
				{
					description: message`Back up and disable Raycast AI settings`,
				},
			),
			command(
				"restore",
				map(object({ dryRun }), (flags) => () => runAi("restore", flags)),
				{
					description: message`Restore AI settings from the backup`,
				},
			),
		),
		{ description: message`Inspect, disable, or restore Raycast AI settings` },
	),
	db,
);

const execute = run(app, {
	programName: "raycast",
	args: process.argv.slice(2),
	brief: message`Manage the local Raycast profile`,
	help: "both",
	commandList: "top-level",
});
await execute();
