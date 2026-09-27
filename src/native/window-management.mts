import type { NativeWindowManagementRepository } from "./generated.mts";
import type { JsonValue } from "./types.mts";

export type WindowLayoutDimension = { absolute: number } | { relative: number };
export type WindowLayoutSource = {
	name: string;
	raycastAppId: string;
	openArgument?:
		| { quicklinkId: string; name: string; icon?: string; url: string }
		| { path: string; name: string }
		| { url: string }
		| { arguments: string };
};
export type WindowLayoutInput = {
	id?: string;
	position: string;
	// Storage preserves arbitrary JSON; the UI uses WindowLayoutDimension values
	size: Record<string, JsonValue>;
	offset: Record<string, JsonValue>;
	zPosition?: number;
	source?: WindowLayoutSource;
	displayIndex?: number;
};
export type WindowLayout = Omit<WindowLayoutInput, "id" | "zPosition"> & {
	id: string;
	groupId: string;
	zPosition: number;
	updatedAt: string;
};
export type WindowLayoutGroupInput = {
	id?: string;
	name: string;
	iconName?: string;
	ignoreGap?: boolean;
	otherWindows?: "none" | "minimize" | "close";
	layouts: WindowLayoutInput[];
	createdAt?: string;
	updatedAt?: string;
};
export type WindowLayoutGroupUpdate = Partial<
	Omit<WindowLayoutGroupInput, "id" | "createdAt" | "updatedAt">
>;
export type WindowLayoutGroup = Omit<
	WindowLayoutGroupInput,
	"id" | "ignoreGap" | "otherWindows" | "layouts" | "createdAt" | "updatedAt"
> & {
	id: string;
	ignoreGap: boolean;
	otherWindows: "none" | "minimize" | "close";
	layouts: WindowLayout[];
	createdAt: string;
	updatedAt: string;
};
export type WindowLayoutPlatformSources = {
	layoutId: string;
	macos?: WindowLayoutSource;
	windows?: WindowLayoutSource;
};

type WindowManagementContract = {
	list(): Promise<WindowLayoutGroup[]>;
	getOne(id: string): Promise<WindowLayoutGroup | null>;
	save(input: WindowLayoutGroupInput): Promise<WindowLayoutGroup>;
	// Update and replace throw when the group does not exist
	updateOne(
		id: string,
		update: WindowLayoutGroupUpdate,
	): Promise<WindowLayoutGroup>;
	replaceOne(
		id: string,
		input: WindowLayoutGroupInput,
	): Promise<WindowLayoutGroup>;
	insertMany(inputs: WindowLayoutGroupInput[]): Promise<void>;
	deleteOne(id: string): Promise<void>;
	deleteAll(): Promise<void>;
	exportPlatformSources(): Promise<WindowLayoutPlatformSources[]>;
	importPlatformSources(sources: WindowLayoutPlatformSources[]): Promise<void>;
};
export type WindowManagementRepository = Omit<
	NativeWindowManagementRepository,
	keyof WindowManagementContract
> &
	WindowManagementContract;
