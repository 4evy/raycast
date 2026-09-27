import { execFile as execFileCallback } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export async function extractDatabaseKey(): Promise<{
	stdout: string;
	stderr: string;
}> {
	const { stdout, stderr } = await execFile(
		path.resolve(import.meta.dirname, "../../bin/extract-key.sh"),
	);
	return { stdout, stderr };
}
