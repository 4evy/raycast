import type {
	EffectSite,
	FunctionEvidence,
	HandlerEvidence,
} from "./model.mts";

type Step = FunctionEvidence["calls"][number] & { file: string };
export type TracedEffect = EffectSite & { file: string; via: Step[] };

// Breadth-first traversal retains a shortest path even through recursive helpers
export function traceEffects(
	graph: Readonly<Record<string, FunctionEvidence>>,
	handlers: Readonly<Record<string, HandlerEvidence>>,
	handler: string,
	filter = "",
) {
	const summary = handlers[handler]?.effectTrace;
	if (!summary)
		throw new Error(`No resolved effect trace for handler: ${handler}`);
	const parents = new Map<string, { parent: string; step: Step } | null>([
		[summary.root, null],
	]);
	const pending = [summary.root];
	const effects: TracedEffect[] = [];
	for (let i = 0; i < pending.length; i++) {
		const id = pending[i];
		const fn = graph[id];
		if (!fn)
			throw new Error(`Incomplete effect graph: ${id}; regenerate source:api`);
		for (const effect of fn.effects) {
			if (!effect.name.includes(filter)) continue;
			const via: Step[] = [];
			let ancestor = parents.get(id);
			while (ancestor) {
				via.push(ancestor.step);
				ancestor = parents.get(ancestor.parent);
			}
			effects.push({ ...effect, file: fn.file, via: via.reverse() });
		}
		for (const edge of fn.calls) {
			if (parents.has(edge.target)) continue;
			parents.set(edge.target, {
				parent: id,
				step: { ...edge, file: fn.file },
			});
			pending.push(edge.target);
		}
	}
	return { handler, summary, effects };
}
