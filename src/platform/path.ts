import os from "node:os";
import path from "node:path";

export function expandHome(file: string): string {
	if (file === "~") return os.homedir();
	return file.startsWith("~/") ? path.join(os.homedir(), file.slice(2)) : file;
}
