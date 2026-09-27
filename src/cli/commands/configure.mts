import { configureFile } from "../../public/v1/index.mts";
export async function runConfigure(
	configPath: string,
	ifPresent = false,
): Promise<void> {
	const result = await configureFile(configPath, ifPresent);
	for (const warning of result.warnings) console.error(`raycast: ${warning}`);
	console.error(
		result.applied
			? "raycast: consumer config applied"
			: `raycast: consumer config absent; skipping: ${result.configFile}`,
	);
}
