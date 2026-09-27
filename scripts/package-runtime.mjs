import { cp, rm } from "node:fs/promises";

if (process.argv[2] === "clean") {
	await rm(new URL("../dist/", import.meta.url), {
		recursive: true,
		force: true,
	});
} else {
	await cp(
		new URL("../bin/", import.meta.url),
		new URL("../dist/bin/", import.meta.url),
		{ recursive: true },
	);
}
