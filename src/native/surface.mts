import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dataAddonPath, loadRaycastDataAddon } from "../platform/database.mts";

export type NativeMember = { kind: "method" | "getter" | "value" };
export type NativeExport = {
	kind: "class" | "function" | "enum" | "value";
	members: Record<string, NativeMember>;
	statics: Record<string, NativeMember>;
	values: Record<string, string | number | boolean | null>;
};
export type NativeSurface = {
	sha256: string;
	exports: Record<string, NativeExport>;
};

// Inspect descriptors without constructing clients or invoking native getters
export function describeNativeAddon(addon: object): NativeSurface["exports"] {
	return Object.fromEntries(
		Object.entries(Object.getOwnPropertyDescriptors(addon))
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([name, descriptor]) => {
				const value: unknown = descriptor.value;
				const entry: NativeExport = {
					kind: "value",
					members: {},
					statics: {},
					values: {},
				};
				if (typeof value === "function") {
					const members = Object.entries(
						Object.getOwnPropertyDescriptors(value.prototype ?? {}),
					).filter(([key]) => key !== "constructor");
					entry.kind = members.length ? "class" : "function";
					entry.statics = Object.fromEntries(
						Object.entries(Object.getOwnPropertyDescriptors(value))
							.filter(
								([key]) =>
									![
										"name",
										"length",
										"prototype",
										"arguments",
										"caller",
									].includes(key),
							)
							.sort(([a], [b]) => a.localeCompare(b))
							.map(([key, d]) => [
								key,
								{
									kind: d.get
										? "getter"
										: typeof d.value === "function"
											? "method"
											: "value",
								},
							]),
					);
					entry.members = Object.fromEntries(
						members
							.sort(([a], [b]) => a.localeCompare(b))
							.map(([key, d]) => [
								key,
								{
									kind: d.get
										? "getter"
										: typeof d.value === "function"
											? "method"
											: "value",
								},
							]),
					);
				} else if (value !== null && typeof value === "object") {
					entry.kind = "enum";
					for (const [key, d] of Object.entries(
						Object.getOwnPropertyDescriptors(value),
					).sort(([a], [b]) => a.localeCompare(b))) {
						if (
							d.value === null ||
							["string", "number", "boolean"].includes(typeof d.value)
						)
							entry.values[key] = d.value;
						else
							throw new Error(`Unsupported native enum member: ${name}.${key}`);
					}
				}
				return [name, entry];
			}),
	);
}

export async function inspectNativeSurface(): Promise<NativeSurface> {
	return {
		sha256: createHash("sha256")
			.update(await readFile(dataAddonPath()))
			.digest("hex"),
		exports: describeNativeAddon(loadRaycastDataAddon()),
	};
}
