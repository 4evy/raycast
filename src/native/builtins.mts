import catalog from "../../data/builtin-api.json" with { type: "json" };

export const builtinApiCatalog = catalog;
export type BuiltinExtensionId = keyof typeof catalog.extensions;
type BuiltinDefinition = {
	id: string;
	commands: Record<
		string,
		{
			settings: Record<string, Record<string, unknown>>;
			directActionHandlers: Array<{ values: Record<string, string> }>;
		}
	>;
	preferences: object;
	state: object;
	config: object;
};

export function builtinApi(filter = "") {
	const matches = (extension: BuiltinDefinition) =>
		extension.id.includes(filter) ||
		[
			extension.commands,
			extension.preferences,
			extension.state,
			extension.config,
		].some((section) =>
			Object.keys(section).some((name) => name.includes(filter)),
		) ||
		Object.values(extension.commands).some(
			(command) =>
				Object.values(command.settings).some((section) =>
					Object.keys(section).some((name) => name.includes(filter)),
				) ||
				command.directActionHandlers.some((handler) =>
					Object.values(handler.values).some((value) => value.includes(filter)),
				),
		);
	return {
		release: catalog.release.version,
		extensions: Object.fromEntries(
			Object.entries(catalog.extensions).filter(([, extension]) =>
				matches(extension),
			),
		),
		definitions: Object.fromEntries(
			Object.entries(catalog.definitions).filter(([, definitions]) =>
				definitions.some(matches),
			),
		),
		unresolved: catalog.unresolved,
	};
}
