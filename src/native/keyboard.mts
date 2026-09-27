import type {
	ControlKey,
	Directionality,
	KeyboardShortcutLocality,
	ModifierKey,
} from "./generated.mts";

// Shapes used by the backend shortcut formatter and native settings API
export type KeyboardModifier = {
	modifier: ModifierKey;
	directionality?: Directionality;
};
export type KeyboardKey =
	| { type: "LayoutIndependent"; code: number }
	| {
			type: "LayoutDependent";
			keyType:
				| { type: "Character"; equivalent: string; fallbackAscii?: string }
				| { type: "Control"; key: ControlKey };
	  };
export type SingleStepShortcut = {
	modifiers: KeyboardModifier[];
	key: KeyboardKey;
};
export type SingleKeyShortcut =
	| { type: "Key"; key: KeyboardKey }
	| { type: "Modifier"; modifier: KeyboardModifier }
	| { type: "Modifiers"; modifiers: KeyboardModifier[] };
export type KeyboardShortcutKind =
	| { type: "SingleStep"; shortcut: SingleStepShortcut }
	| { type: "SingleKey"; shortcut: SingleKeyShortcut }
	| {
			type: "MultiStep";
			shortcut: { initial: SingleStepShortcut; next: SingleStepShortcut[] };
	  }
	| { type: "DoubleTap"; shortcut: { modifier: KeyboardModifier } };
export type KeyboardShortcut = {
	kind: KeyboardShortcutKind;
	locality: KeyboardShortcutLocality;
};
