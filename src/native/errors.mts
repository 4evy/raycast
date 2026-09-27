import catalog from "../../data/native-api.json" with { type: "json" };

export type NativeErrorInfo = {
	code: number;
	message: string;
	names: string[];
};
const errorNames = new Map<number, string[]>();
for (const [name, entry] of Object.entries(catalog.native.exports)) {
	if (!name.endsWith("ErrorCode")) continue;
	for (const [member, code] of Object.entries(entry.values)) {
		if (typeof code !== "number") continue;
		const names = errorNames.get(code) ?? [];
		names.push(`${name}.${member}`);
		errorNames.set(code, names);
	}
}

// Raycast's backend reads the native numeric code from the message prefix
export function parseNativeError(error: unknown): NativeErrorInfo | undefined {
	const message =
		error instanceof Error
			? error.message
			: typeof error === "string"
				? error
				: undefined;
	const match = message?.match(/^Code: ([0-9]+), Message: ([\s\S]*)$/);
	if (!match) return undefined;
	const code = Number(match[1]);
	if (!Number.isSafeInteger(code)) return undefined;
	return { code, message: match[2], names: [...(errorNames.get(code) ?? [])] };
}

export function isNativeError(error: unknown, code: number): boolean {
	return parseNativeError(error)?.code === code;
}
