import * as v from "valibot";
import type { RaycastDatabaseClient } from "../../native/types.mts";
import { PATHS } from "../../shared/config.mts";

export const currentUserSchema = v.looseObject({
	id: v.pipe(v.string(), v.minLength(1)),
	name: v.pipe(v.string(), v.minLength(1)),
});

export type RaycastProfilePayload = {
	currentUser: v.InferOutput<typeof currentUserSchema>;
};

export const PROFILE_USER_DEFAULTS = PATHS.profileUserDefaults;

export function parseProfilePayload(
	currentUser: string | undefined,
): RaycastProfilePayload {
	return {
		currentUser: v.parse(
			currentUserSchema,
			JSON.parse(
				v.parse(
					v.pipe(
						v.string("current user JSON is required"),
						v.minLength(1, "current user JSON is required"),
					),
					currentUser,
				),
			),
		),
	};
}

export async function applyProfileDefaults(
	db: RaycastDatabaseClient,
	profile: RaycastProfilePayload,
): Promise<RaycastProfilePayload["currentUser"]> {
	await db.userDefaults.set(
		PROFILE_USER_DEFAULTS.currentUser,
		JSON.stringify(profile.currentUser),
	);
	await db.userDefaults.delete(PROFILE_USER_DEFAULTS.oauthToken);
	await db.userDefaults.delete("AuthSessionExpired");

	const stored = await db.userDefaults.get(PROFILE_USER_DEFAULTS.currentUser);
	if (typeof stored !== "string")
		throw new Error("CurrentUser was not stored as JSON text");
	return parseProfilePayload(stored).currentUser;
}

export function profileSummary(
	stored: { name: string } & Record<string, unknown>,
): string {
	const subscription = stored.subscription;
	const status =
		subscription && typeof subscription === "object" && "status" in subscription
			? subscription.status
			: undefined;
	return `OK - ${stored.name} | pro:${stored.has_pro_features} | sub:${status}`;
}
