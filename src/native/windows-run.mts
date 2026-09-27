import type { Page, PageCursor } from "../features/documents/repositories.mts";
import type { NativeWindowsRunCommandsRepository } from "./generated.mts";

export type WindowsRunCommandCreate = {
	alias: string;
	command: string;
	arguments: string;
	description?: string;
	icon?: string;
	shell?: string;
	tags?: string[];
};
export type WindowsRunCommandUpdate = Partial<
	Omit<WindowsRunCommandCreate, "shell">
> & {
	// Null clears the override; creation accepts only a string or omission
	shell?: string | null;
};
export type WindowsRunCommand = {
	id: string;
	alias: string;
	command: string;
	arguments: string;
	description: string;
	icon: string;
	shell?: string;
	tags: string[];
	isPinned: boolean;
	pinned?: number;
	timesExecuted: number;
	lastExecutedAt?: string;
	createdAt: string;
	updatedAt: string;
};
export type WindowsRunCommandMatch = {
	record: WindowsRunCommand;
	additionalArguments: string;
};

type WindowsRunCommandsContract = {
	all(
		cursor?: PageCursor,
		limit?: number,
		filter?: string,
		tags?: string[],
	): Promise<Page<WindowsRunCommand>>;
	// Missing IDs throw WindowsRunCommandErrorCode.NotFound
	getOne(id: string): Promise<WindowsRunCommand>;
	insertOne(input: WindowsRunCommandCreate): Promise<WindowsRunCommand>;
	updateOne(
		id: string,
		update: WindowsRunCommandUpdate,
	): Promise<WindowsRunCommand>;
	deleteOne(id: string): Promise<WindowsRunCommand>;
	deleteAll(): Promise<void>;
	duplicate(id: string): Promise<WindowsRunCommand>;
	getAllTags(): Promise<string[]>;
	getByAlias(alias: string, limit?: number): Promise<WindowsRunCommand[]>;
	getByCommand(
		command: string,
		args: string,
	): Promise<WindowsRunCommandMatch | null>;
	pinOne(id: string): Promise<void>;
	unpinOne(id: string): Promise<void>;
	movePinnedUp(id: string): Promise<void>;
	movePinnedDown(id: string): Promise<void>;
	recordExecution(id: string): Promise<void>;
};
export type WindowsRunCommandsRepository = Omit<
	NativeWindowsRunCommandsRepository,
	keyof WindowsRunCommandsContract
> &
	WindowsRunCommandsContract;
