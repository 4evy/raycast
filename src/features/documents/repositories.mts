// Reviewed against Raycast 2.5.2.0 backend import/export schemas and native
// calls Notes: lines 352190–352295; snippets: 350530–350543; quicklinks:
// 352449–352463
import { isDeepStrictEqual } from "node:util";
import type {
	NativeNotesRepository,
	NativeQuicklinksRepository,
	NativeSnippetsRepository,
} from "../../native/generated.mts";
import type { JsonValue } from "../../native/types.mts";

// Cursors are opaque native objects; pass them back without reducing them
// to IDs
export type PageCursor = Readonly<Record<string, JsonValue>>;
export type Page<T> = { entries: T[]; nextCursor?: PageCursor };
export type Note = {
	id: string;
	text: string;
	title?: string;
	rawContent?: JsonValue;
	pinned?: number;
	createdAt: string;
	updatedAt: string;
	lastAccessedAt: string;
	caretPosition: number;
};
export type DeletedNote = {
	id: string;
	text: string;
	title?: string;
	deletedAt: string;
};
export type NoteWindowData = {
	currentNote?: Note;
	previousNoteId?: string;
	nextNoteId?: string;
	pinnedShortcutNoteIds: string[];
};
export type NoteCreate = Pick<Note, "text"> & Partial<Omit<Note, "text">>;
export type NoteUpdate = Partial<
	Pick<Note, "text" | "title" | "rawContent" | "caretPosition">
>;
export type Snippet = {
	id: string;
	icon: string;
	title: string;
	keyword?: string;
	rawContent: JsonValue;
	text: string;
	copyCount: number;
	pinned?: number;
	tags: string[];
	createdAt: string;
	updatedAt: string;
	accessedAt: string;
};
export type SnippetCreate = Pick<
	Snippet,
	"icon" | "title" | "rawContent" | "text"
> &
	Partial<Omit<Snippet, "icon" | "title" | "rawContent" | "text">>;
export type SnippetUpdate = Partial<
	Pick<Snippet, "icon" | "title" | "keyword" | "rawContent" | "text" | "tags">
>;
export type Quicklink = {
	id: string;
	name: string;
	link: string;
	rawContent: JsonValue;
	icon: string;
	openCount: number;
	openWith?: string;
	tags: string[];
	createdAt: string;
	updatedAt: string;
	pinned?: number;
};
// Native QuickLinkCreate requires a ULID supplied by the caller
export type QuicklinkCreate = Pick<
	Quicklink,
	"id" | "name" | "link" | "rawContent" | "icon"
> &
	Partial<Omit<Quicklink, "id" | "name" | "link" | "rawContent" | "icon">>;
export type QuicklinkUpdate = Partial<
	Pick<Quicklink, "name" | "link" | "rawContent" | "icon" | "tags">
> & { openWith?: string | null };
type Refine<Base, Contract> = Omit<Base, keyof Contract> & Contract;
export type NotesRepository = Refine<
	NativeNotesRepository,
	{
		list(
			cursor?: PageCursor,
			limit?: number,
			filter?: string,
		): Promise<Page<Note>>;
		browse(
			cursor?: PageCursor,
			limit?: number,
			filter?: string,
		): Promise<Page<Note>>;
		count(): Promise<number>;
		getWindowData(noteId?: string): Promise<NoteWindowData>;
		listDeleted(): Promise<DeletedNote[]>;
		deleteOne(id: string): Promise<void>;
		deleteAll(): Promise<void>;
		pinOne(id: string): Promise<void>;
		unpinOne(id: string): Promise<void>;
		movePinnedUp(id: string): Promise<void>;
		movePinnedDown(id: string): Promise<void>;
		touchAccessed(id: string): Promise<void>;
		recoverOne(id: string): Promise<void>;
		permanentlyDeleteOne(id: string): Promise<void>;
		emptyTrash(): Promise<void>;
		purgeOldDeleted(before: string): Promise<void>;
		insertOne(note: NoteCreate): Promise<Note>;
		updateOne(
			id: string,
			update: NoteUpdate,
			expectedUpdatedAt?: string,
		): Promise<Note>;
	}
>;
export type SnippetsRepository = Refine<
	NativeSnippetsRepository,
	{
		list(
			cursor?: PageCursor,
			limit?: number,
			filter?: string,
			tags?: string[],
		): Promise<Page<Snippet>>;
		getOne(id: string): Promise<Snippet>;
		getByTitle(title: string, limit: number): Promise<Snippet[]>;
		getKeywords(): Promise<Array<{ id: string; keyword: string }>>;
		getAllTags(): Promise<string[]>;
		updateAccessedAt(id: string): Promise<void>;
		// Counter writes require DatabaseClient.setDeviceId to have run
		updateCopyCount(id: string): Promise<void>;
		insertOne(snippet: SnippetCreate): Promise<Snippet>;
		updateOne(id: string, update: SnippetUpdate): Promise<Snippet>;
	}
>;
export type QuicklinksRepository = Refine<
	NativeQuicklinksRepository,
	{
		list(
			cursor?: PageCursor,
			limit?: number,
			filter?: string,
			tags?: string[],
		): Promise<Page<Quicklink>>;
		getOne(id: string): Promise<Quicklink>;
		// Counter writes require DatabaseClient.setDeviceId to have run
		updateOpenCount(id: string): Promise<void>;
		count(): Promise<number>;
		insertOne(quicklink: QuicklinkCreate): Promise<void>;
		updateOne(id: string, update: QuicklinkUpdate): Promise<void>;
	}
>;

// Empty pages can still carry a continuation cursor
export async function* iterateEntries<T>(
	fetchPage: (cursor: PageCursor | undefined) => Promise<Page<T>>,
): AsyncGenerator<T> {
	let cursor: PageCursor | undefined;
	do {
		const page = await fetchPage(cursor);
		if (!Array.isArray(page.entries))
			throw new Error("Native page is missing its entries array");
		yield* page.entries;
		if (
			page.nextCursor !== undefined &&
			isDeepStrictEqual(page.nextCursor, cursor)
		)
			throw new Error("Native pagination cursor did not advance");
		cursor = page.nextCursor;
	} while (cursor !== undefined);
}
