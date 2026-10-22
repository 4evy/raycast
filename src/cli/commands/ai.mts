import { createRaycastClient } from "../../public/v1/index.mts";
import { IO } from "../../shared/config.mts";

export async function runAi(
	action: "status" | "disable" | "restore",
	options: { dryRun: boolean } = { dryRun: false },
): Promise<void> {
	const { ai } = createRaycastClient();
	console.log(
		JSON.stringify(
			await (action === "status" ? ai.status() : ai[action](options)),
			null,
			IO.JSON_INDENT,
		),
	);
}
