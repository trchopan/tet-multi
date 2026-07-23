import { describe, expect, test } from 'bun:test';
import {
	BOARD_CELL_COUNT,
	BOARD_HIDDEN_HEIGHT,
	BOARD_INTERNAL_HEIGHT,
	BOARD_VISIBLE_HEIGHT,
	BOARD_WIDTH,
} from '../../shared/constants';
import {
	boardIndex,
	canPlacePiece,
	createEmptyBoard,
	getCell,
	placePiece,
	serializeBoard,
	setCell,
} from '../board';

describe('board foundation', () => {
	test('uses the specified internal dimensions and hidden rows', () => {
		const board = createEmptyBoard();
		expect(board.cells).toHaveLength(BOARD_CELL_COUNT);
		expect(BOARD_HIDDEN_HEIGHT + BOARD_VISIBLE_HEIGHT).toBe(
			BOARD_INTERNAL_HEIGHT,
		);
		expect(boardIndex(0, BOARD_HIDDEN_HEIGHT)).toBe(BOARD_WIDTH * 4);
		expect(boardIndex(BOARD_WIDTH - 1, BOARD_INTERNAL_HEIGHT - 1)).toBe(
			BOARD_CELL_COUNT - 1,
		);
	});

	test('rejects wall, floor, and occupied-cell collisions', () => {
		const board = createEmptyBoard();
		expect(canPlacePiece(board, { kind: 'O', x: -1, y: 0 })).toBe(false);
		expect(
			canPlacePiece(board, { kind: 'I', x: 3, y: BOARD_INTERNAL_HEIGHT - 1 }),
		).toBe(false);
		placePiece(board, { kind: 'T', x: 3, y: 4 });
		expect(canPlacePiece(board, { kind: 'O', x: 4, y: 4 })).toBe(false);
	});

	test('places pieces and preserves row-major serialized cells', () => {
		const board = createEmptyBoard();
		expect(placePiece(board, { kind: 'J', x: 3, y: 0 })).toBe(true);
		expect(getCell(board, 3, 0)).toBe(2);
		expect(getCell(board, 3, 1)).toBe(2);
		expect(getCell(board, 5, 1)).toBe(2);
		expect(serializeBoard(board)).toEqual(board.cells);
	});

	test('rejects invalid board cells and serialized shapes', () => {
		const board = createEmptyBoard();
		expect(() => setCell(board, 0, 0, 9 as never)).toThrow();
		expect(() => serializeBoard({ cells: [0] })).toThrow();
	});
});
