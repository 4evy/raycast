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
};

export function emptyAnalysis(): SourceAnalysis {
	return {
		builtinExtensions: {},
		builtinDefinitions: {},
		unresolvedBuiltins: [],
	};
}

export function mergeAnalysis(
	target: SourceAnalysis,
	source: SourceAnalysis,
): void {
	for (const [id, extension] of Object.entries(source.builtinExtensions)) {
		target.builtinDefinitions[id] ??= [];
		target.builtinDefinitions[id].push(
			...(source.builtinDefinitions[id] ?? [extension]),
		);
		if (!target.builtinExtensions[id] || extension.file.startsWith("backend/"))
			target.builtinExtensions[id] = extension;
	}
	target.unresolvedBuiltins.push(...source.unresolvedBuiltins);
}
