import { z } from "zod";
import type { RaycastDatabaseClient } from "../../native/types.mts";
import { PATHS } from "../../shared/config.mts";

export const currentUserSchema = z.looseObject({
	id: z.string().min(1),
	name: z.string().min(1),
});

export type RaycastProfilePayload = {
	currentUser: z.infer<typeof currentUserSchema>;
};

export const PROFILE_USER_DEFAULTS = PATHS.profileUserDefaults;

export function parseProfilePayload(
	currentUser: string | undefined,
): RaycastProfilePayload {
	return {
		currentUser: currentUserSchema.parse(
			JSON.parse(
				z
					.string({ error: "current user JSON is required" })
					.min(1, "current user JSON is required")
					.parse(currentUser),
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
