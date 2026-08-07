import {
	array,
	boolean,
	integer,
	length,
	literal,
	number,
	optional,
	pipe,
	strictObject,
	union,
} from 'valibot';
import {
	BOARD_CELL_COUNT,
	NEXT_PREVIEW_COUNT,
	PIECE_KINDS,
	SNAPSHOT_CELL_VALUES,
} from '../constants';

const literals = <const T extends readonly (string | number | boolean)[]>(
	values: T,
) => union(values.map((value) => literal(value)));

export const pieceKindSchema = literals(PIECE_KINDS);
export const boardCellValueSchema = literals(SNAPSHOT_CELL_VALUES);

export const activePieceSchema = strictObject({
	kind: pieceKindSchema,
	x: pipe(number(), integer()),
	y: pipe(number(), integer()),
	rotation: literals([0, 1, 2, 3]),
});

export const fallingBlocksPlayerSnapshotSchema = strictObject({
	board: optional(pipe(array(boardCellValueSchema), length(BOARD_CELL_COUNT))),
	activePiece: optional(activePieceSchema),
	hold: optional(pieceKindSchema),
	next: optional(pipe(array(pieceKindSchema), length(NEXT_PREVIEW_COUNT))),
	score: optional(pipe(number(), integer())),
	lines: optional(pipe(number(), integer())),
	level: optional(pipe(number(), integer())),
	combo: optional(pipe(number(), integer())),
	maxCombo: optional(pipe(number(), integer())),
	backToBack: optional(boolean()),
	attackSent: optional(pipe(number(), integer())),
	incomingGarbage: optional(pipe(number(), integer())),
	lastProcessedInput: optional(pipe(number(), integer())),
});
