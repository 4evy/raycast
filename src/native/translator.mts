import type { NativeTranslateCustomCommandsRepository } from "./generated.mts";

export type TranslateOutputBehavior = "open-in-raycast" | "replace-selection";
export type TranslateCustomCommandInput = {
	name: string;
	sourceLanguage: string;
	targetLanguage: string;
	// Omission defaults to open-in-raycast
	outputBehavior?: TranslateOutputBehavior;
};
export type TranslateCustomCommand = Required<TranslateCustomCommandInput> & {
	id: string;
	createdAt: string;
	updatedAt: string;
};
export type TranslationInput = {
	text: string;
	source?: string;
	target: string;
};
export type Translation = {
	text: string;
	detectedSourceLanguageCode?: string;
};

type TranslateCustomCommandsContract = {
	list(): Promise<TranslateCustomCommand[]>;
	getOne(id: string): Promise<TranslateCustomCommand | null>;
	save(input: TranslateCustomCommandInput): Promise<TranslateCustomCommand>;
	// Unlike getOne, updating a missing command throws
	updateOne(
		id: string,
		update: Partial<TranslateCustomCommandInput>,
	): Promise<TranslateCustomCommand>;
	deleteOne(id: string): Promise<void>;
};
export type TranslateCustomCommandsRepository = Omit<
	NativeTranslateCustomCommandsRepository,
	keyof TranslateCustomCommandsContract
> &
	TranslateCustomCommandsContract;
