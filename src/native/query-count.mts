import get from "es-toolkit/compat/get";
import size from "es-toolkit/compat/size";
import type { CountQuery } from "../shared/config.mts";
import { callPath } from "./call-path.mts";

export async function queryCount(
	source: unknown,
	query: CountQuery,
): Promise<readonly [string, number | { error: string }]> {
	try {
		const result = await callPath(source, query.methodPath, query.args ?? []);
		const selected: unknown = query.select
			? get(result, [query.select])
			: result;
		const filter = query.filter;
		const records = filter
			? Array.isArray(selected)
				? selected.filter((item) => get(item, filter.path) === filter.equals)
				: []
			: selected;
		return [
			query.key,
			typeof records === "number"
				? records
				: typeof records === "object"
					? size(records)
					: 0,
		];
	} catch (error) {
		return [
			query.key,
			{ error: error instanceof Error ? error.message : String(error) },
		];
	}
}
