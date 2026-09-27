import { isDeepStrictEqual } from "node:util";
import catalog from "../../data/native-api.json" with { type: "json" };
import { callPath } from "./call-path.mts";
import { inspectNativeSurface, type NativeSurface } from "./surface.mts";
import type {
	RaycastDatabaseClient,
	RaycastDatabaseSnapshot,
} from "./types.mts";

export const nativeApiCatalog = catalog;

type Method = (...args: never[]) => unknown;
type MethodKeys<T> = {
	[K in keyof T]: T[K] extends Method ? K : never;
}[keyof T] &
	string;
type RepositoryKeys = keyof typeof nativeApiCatalog.repositories;
export type DatabaseMethodPath =
	| MethodKeys<RaycastDatabaseClient>
	| {
			[K in RepositoryKeys]: `${K}.${MethodKeys<RaycastDatabaseClient[K]>}`;
	  }[RepositoryKeys];
type MethodAt<P extends DatabaseMethodPath> = P extends `${infer R}.${infer M}`
	? R extends keyof RaycastDatabaseClient
		? M extends keyof RaycastDatabaseClient[R]
			? RaycastDatabaseClient[R][M]
			: never
		: never
	: P extends keyof RaycastDatabaseClient
		? RaycastDatabaseClient[P]
		: never;
type Arguments<P extends DatabaseMethodPath> = Parameters<
	Extract<MethodAt<P>, Method>
>;
type Result<P extends DatabaseMethodPath> = Awaited<
	ReturnType<Extract<MethodAt<P>, Method>>
>;

export function isDatabaseMethodPath(
	value: string,
): value is DatabaseMethodPath {
	return Object.hasOwn(catalog.coverage, value);
}

// Keep the repository receiver and preserve native values such as undefined
export async function callDatabaseMethod<P extends DatabaseMethodPath>(
	db: RaycastDatabaseClient,
	method: P,
	...args: Arguments<P>
): Promise<Result<P>> {
	if (!isDatabaseMethodPath(method))
		throw new Error(`Unknown database method: ${method}`);
	return (await callPath(db, method.split("."), args)) as Result<P>;
}

export function databaseApi(filter = "") {
	return {
		release: catalog.release.version,
		nativeSha256: catalog.native.sha256,
		repositories: catalog.repositories,
		methods: Object.fromEntries(
			Object.entries(catalog.coverage).filter(([name]) =>
				name.includes(filter),
			),
		),
	};
}

// Comparing descriptors also catches enum and getter drift without opening a DB
export async function checkNativeCompatibility() {
	const actual = await inspectNativeSurface();
	const expected: NativeSurface = catalog.native as NativeSurface;
	const changes: string[] = [];
	for (const name of new Set([
		...Object.keys(expected.exports),
		...Object.keys(actual.exports),
	])) {
		const before = expected.exports[name];
		const after = actual.exports[name];
		if (!before || !after)
			changes.push(`${name}: ${before ? "removed" : "added"}`);
		else if (!isDeepStrictEqual(before, after))
			changes.push(`${name}: members or values changed`);
	}
	return {
		matchingBinary: actual.sha256 === expected.sha256,
		matchingSurface: changes.length === 0,
		expectedSha256: expected.sha256,
		actualSha256: actual.sha256,
		changes,
	};
}

export function openDatabaseSnapshot(
	db: RaycastDatabaseClient,
): AsyncDisposable & {
	snapshot: RaycastDatabaseSnapshot;
} {
	const snapshot = db.openDatabaseSnapshot();
	const cleanup = new AsyncDisposableStack();
	cleanup.defer(() => snapshot.release());
	return {
		snapshot,
		[Symbol.asyncDispose]: () => cleanup.disposeAsync(),
	};
}
