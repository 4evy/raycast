import { Effect } from "effect";
import type { CountQuery } from "../../shared/config.mts";
import type { RaycastDatabaseClient } from "../types.mts";

function countRecords(
	db: RaycastDatabaseClient,
	methodPath: readonly string[],
): Promise<unknown[]> {
	switch (methodPath.join(".")) {
		case "settings.allCommandSettings":
			return db.settings.allCommandSettings();
		case "settings.allMcpServers":
			return db.settings.allMcpServers();
		case "frecency.getAll":
			return db.frecency.getAll();
		case "ai.chatGetAllIds":
			return db.ai.chatGetAllIds();
		case "ai.chatGetAllInvalidationSnapshots":
			return db.ai.chatGetAllInvalidationSnapshots();
		case "ai.modelGetAll":
			return db.ai.modelGetAll();
		case "ai.commandGetAll":
			return db.ai.commandGetAll();
		case "ai.modeGetAll":
			return db.ai.modeGetAll();
		case "ai.transcriptionGetAll":
			return db.ai.transcriptionGetAll();
		case "ai.transcriptionStyleGetAll":
			return db.ai.transcriptionStyleGetAll();
		case "ai.scheduledMessageGetAll":
			return db.ai.scheduledMessageGetAll();
		case "ai.folderGetAll":
			return db.ai.folderGetAll();
		case "orgPacks.listOrgSkills":
			return db.orgPacks.listOrgSkills();
		case "orgPacks.listOrgAiAgents":
			return db.orgPacks.listOrgAiAgents();
		default:
			throw new Error(
				`unsupported Raycast count query: ${methodPath.join(".")}`,
			);
	}
}

export async function queryCount(
	source: RaycastDatabaseClient,
	query: CountQuery,
): Promise<readonly [string, number | { error: string }]> {
	return Effect.runPromise(
		Effect.tryPromise({
			try: () => countRecords(source, query.methodPath),
			catch: (error) => error,
		}).pipe(
			Effect.match({
				onSuccess: (records): readonly [string, number] => {
					const filter = query.filter;
					if (!filter) return [query.key, records.length];
					let count = 0;
					for (const record of records) {
						const value = filter.path.reduce<unknown>(
							(value, key) =>
								value !== null && typeof value === "object"
									? Reflect.get(value, key)
									: undefined,
							record,
						);
						if (value === filter.equals) count++;
					}
					return [query.key, count];
				},
				onFailure: (error): readonly [string, { error: string }] => [
					query.key,
					{
						error: error instanceof Error ? error.message : String(error),
					},
				],
			}),
		),
	);
}
