import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

function requiredEnv(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required`);
	return value;
}

function api<T>(method: string, endpoint: string, payload?: unknown): T {
	return JSON.parse(
		execFileSync(
			"gh",
			[
				"api",
				"--method",
				method,
				endpoint,
				...(payload === undefined ? [] : ["--input", "-"]),
			],
			{
				encoding: "utf8",
				...(payload === undefined ? {} : { input: JSON.stringify(payload) }),
			},
		),
	) as T;
}

const repository = requiredEnv("GITHUB_REPOSITORY");
const parent = requiredEnv("GITHUB_SHA");
const branch = requiredEnv("GITHUB_REF_NAME");
const prefix = `repos/${repository}/git`;
const base = api<{ tree: { sha: string } }>(
	"GET",
	`${prefix}/commits/${parent}`,
);
const tree = api<{ sha: string }>("POST", `${prefix}/trees`, {
	base_tree: base.tree.sha,
	tree: [
		{
			path: "release.json",
			mode: "100644",
			type: "blob",
			content: await readFile(
				new URL("../release.json", import.meta.url),
				"utf8",
			),
		},
	],
});
const commit = api<{ sha: string }>("POST", `${prefix}/commits`, {
	message: "raycast: update release",
	tree: tree.sha,
	parents: [parent],
});
api("PATCH", `${prefix}/refs/heads/${branch}`, {
	sha: commit.sha,
	force: false,
});
