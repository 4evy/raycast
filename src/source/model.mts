export type CallEvidence = {
	file: string;
	line: number;
	callee: string;
	arguments: string[];
	argumentKinds: string[];
	objectKeys: string[][];
};
export type EffectSite = {
	kind: "native" | "host" | "notification" | "event";
	name: string;
	line: number;
};
export type FunctionEvidence = {
	file: string;
	line: number;
	effects: EffectSite[];
	calls: Array<{
		target: string;
		line: number;
		callee: string;
		kind: "direct" | "callback";
	}>;
	unresolvedCalls: Array<{ line: number; callee: string }>;
};
export type EffectTrace = {
	root: string;
	reachableFunctions: number;
	unresolvedCalls: number;
	nativeCalls: string[];
	hostCalls: string[];
	notifications: string[];
	events: string[];
};
export type HandlerEvidence = {
	effectTrace?: EffectTrace;
	hostCalls: string[];
	notifications: string[];
	events: string[];
	implementationResolved: boolean;
	file: string;
	line: number;
	parameters: string[];
	inputProperties: string[];
	nativeCalls: string[];
};
export type BuiltinSetting = {
	line: number;
	storage?: string;
	defaultExpression?: string;
};
export type BuiltinExpression = { line: number; expression: string };
export type BuiltinActionHandler = BuiltinExpression & {
	fields: Record<string, BuiltinExpression>;
	values: Record<string, string>;
	unresolved: string[];
};
export type BuiltinCommand = {
	id: string;
	kind: "static" | "dynamic";
	line: number;
	definitionResolved: boolean;
	definition?: BuiltinExpression;
	factory?: {
		line: number;
		parameters: string[];
		arguments: BuiltinExpression[];
	};
	fields: Record<string, BuiltinExpression>;
	actions?: BuiltinExpression;
	directActionHandlers: BuiltinActionHandler[];
	settings: Record<string, Record<string, BuiltinExpression>>;
};
export type BuiltinExtension = {
	id: string;
	key: string;
	title?: string;
	file: string;
	line: number;
	commands: Record<string, BuiltinCommand>;
	preferences: Record<string, BuiltinSetting>;
	state: Record<string, BuiltinSetting>;
	config: Record<string, { line: number; expression: string }>;
};
export type SourceAnalysis = {
	builtinExtensions: Record<string, BuiltinExtension>;
	builtinDefinitions: Record<string, BuiltinExtension[]>;
	unresolvedBuiltins: string[];
	functionGraph: Record<string, FunctionEvidence>;
	handlers: Record<string, HandlerEvidence>;
	unresolvedHandlers: string[];
	calls: Record<string, CallEvidence[]>;
	unresolved: CallEvidence[];
	constructors: CallEvidence[];
};

export function emptyAnalysis(): SourceAnalysis {
	return {
		builtinExtensions: {},
		builtinDefinitions: {},
		unresolvedBuiltins: [],
		functionGraph: {},
		handlers: {},
		unresolvedHandlers: [],
		calls: {},
		unresolved: [],
		constructors: [],
	};
}

export function mergeAnalysis(
	target: SourceAnalysis,
	source: SourceAnalysis,
): void {
	for (const [key, calls] of Object.entries(source.calls)) {
		target.calls[key] ??= [];
		target.calls[key].push(...calls);
	}
	for (const key of ["handlers", "functionGraph"] as const) {
		for (const name of Object.keys(source[key]))
			if (Object.hasOwn(target[key], name))
				throw new Error(`Duplicate ${key} entry: ${name}`);
		Object.assign(target[key], source[key]);
	}
	for (const [id, extension] of Object.entries(source.builtinExtensions)) {
		target.builtinDefinitions[id] ??= [];
		target.builtinDefinitions[id].push(
			...(source.builtinDefinitions[id] ?? [extension]),
		);
		if (!target.builtinExtensions[id] || extension.file.startsWith("backend/"))
			target.builtinExtensions[id] = extension;
	}
	for (const key of [
		"unresolvedBuiltins",
		"unresolvedHandlers",
		"unresolved",
		"constructors",
	] as const)
		(target[key] as unknown[]).push(...source[key]);
}
