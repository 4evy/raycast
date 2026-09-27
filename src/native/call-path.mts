import get from "es-toolkit/compat/get";

export async function callPath(
	source: unknown,
	segments: readonly string[],
	args: readonly unknown[] = [],
): Promise<unknown> {
	if (segments.length === 0) throw new Error("method path must not be empty");
	const method: unknown = get(source, segments);
	if (typeof method !== "function") {
		throw new Error(`missing Raycast database method: ${segments.join(".")}`);
	}
	const receiver =
		segments.length === 1 ? source : get(source, segments.slice(0, -1));
	return Reflect.apply(method, receiver, args);
}
