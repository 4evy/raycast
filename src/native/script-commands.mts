import type { JsonValue } from "./types.mts";

export type ScriptCommandMode = "fullOutput" | "compact" | "silent" | "inline";
export type ScriptShebang = { interpreter: string; args: string[] };
export type ScriptCommandArgument = {
	// These metadata values are parsed as JSON without type validation
	type: JsonValue;
	placeholder: JsonValue;
	optional: boolean;
	secure: boolean;
	percentEncoded: boolean;
	data?: JsonValue;
};
export type ScriptCommand = {
	path: string;
	schemaVersion: 1;
	title: string;
	mode: ScriptCommandMode;
	packageName: string;
	icon?: string;
	iconDark?: string;
	description?: string;
	author?: string;
	authorURL?: string;
	currentDirectoryPath?: string;
	needsConfirmation: boolean;
	refreshTime?: string;
	arguments: ScriptCommandArgument[];
	shebang?: ScriptShebang;
};
export type ScriptExecutionInput = {
	path: string;
	arguments?: string[];
	cwd?: string;
	// Retained by the protocol; this release executes the path directly
	shebang?: ScriptShebang;
};
export type ScriptExecutionResult = {
	success: boolean;
	output: string;
	exitCode: number | null;
	error?: string;
};
export type ScriptOutputChunk = {
	executionId: string;
	chunk: string;
	stream: "stdout" | "stderr";
	urls?: Array<{ url: string; start: number; end: number }>;
};
export type ScriptCompletion = Omit<ScriptExecutionResult, "output"> & {
	executionId: string;
	// Seconds since launch, including spawn time
	duration: number;
};
export type ScriptCancellationResult =
	| { success: true }
	| { success: false; error: string };
