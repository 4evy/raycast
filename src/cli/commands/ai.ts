import { createRaycastClient } from "../../public/v1/index.ts";
import { IO } from "../../shared/config.ts";

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
