import type { NativeCalculatorRepository } from "./generated.mts";

// Evaluation tags are enumerated by the bundled _Ar and vAr consumers
export type CalculatorEvaluationType =
	| "decimal"
	| "percentage"
	| "multiplier"
	| "binary"
	| "octal"
	| "hexadecimal"
	| "scientificNotation"
	| "salesTax"
	| "timestamp"
	| "degreesMinutesSeconds"
	| "unitExpression"
	| "fraction"
	| "boolean"
	| "decimalRate"
	| "percentageRate"
	| "laptime"
	| "frametime"
	| "pitch"
	| "place"
	| "customType"
	| "statisticType"
	| "list"
	| "unitRate"
	| "unitRange"
	| "unit"
	| "rawString"
	| "dynamicPlace"
	| "date"
	| "iso8601"
	| "datespan"
	| "timespan"
	| "resolution"
	| "variable"
	| "gpsCoordinates"
	| "substance"
	| "customUnit"
	| "weather"
	| "context";

export type CalculatorToken = {
	type: string;
	subtype?: string;
	text: string;
	subtokens?: CalculatorToken[];
};

type KnownCalculatorResults = {
	decimal: number;
	percentage: number;
	boolean: boolean;
	date: { date: string; hasExplicitTimeComponent: boolean };
};

// Other payloads cross the native addon boundary without a JavaScript schema
export type CalculatorEvaluation = {
	[K in CalculatorEvaluationType]: {
		type: K;
		description: string;
		tokens?: CalculatorToken[];
		result: K extends keyof KnownCalculatorResults
			? KnownCalculatorResults[K]
			: unknown;
	};
}[CalculatorEvaluationType];

export type CalculatorResponse = {
	request: {
		expression: string;
		tokens?: CalculatorToken[];
		metadata?: { type: string; [key: string]: unknown };
	};
	evaluation: CalculatorEvaluation;
};

export type CalculationType =
	| "math"
	| "dateTime"
	| "unitConversion"
	| "unknown";
export type CalculatorHistoryEntry = {
	id: string;
	expression: string;
	result: string;
	calculationType: CalculationType;
	copyCount: number;
	pinned?: number;
	createdAt: string;
	updatedAt: string;
};
export type CalculatorHistoryInput = Pick<
	CalculatorHistoryEntry,
	"expression" | "result" | "calculationType"
>;

type CalculatorContract = {
	all(filter?: string): Promise<CalculatorHistoryEntry[]>;
	// Missing IDs throw CalculatorErrorCode.EntryNotFound
	getOne(id: string): Promise<CalculatorHistoryEntry>;
	// Upsert returns the history entry ID
	upsert(input: CalculatorHistoryInput): Promise<string>;
	deleteOne(id: string): Promise<void>;
	// False preserves pinned entries
	deleteAll(includePinned: boolean): Promise<void>;
	deleteExceedingLimit(limit: number): Promise<void>;
	deleteOlderThan(days: number): Promise<void>;
	pinOne(id: string): Promise<void>;
	unpinOne(id: string): Promise<void>;
	movePinnedUp(id: string): Promise<void>;
	movePinnedDown(id: string): Promise<void>;
};
export type CalculatorRepository = Omit<
	NativeCalculatorRepository,
	keyof CalculatorContract
> &
	CalculatorContract;
