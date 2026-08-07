import { describe, expect, test } from 'bun:test';
import {
	BOARD_CELL_COUNT,
	BOARD_HIDDEN_HEIGHT,
	BOARD_INTERNAL_HEIGHT,
	BOARD_VISIBLE_HEIGHT,
	BOARD_WIDTH,
} from '$/games/falling-blocks/constants';
import {
	boardIndex,
	canPlacePiece,
	clearLines,
	createEmptyBoard,
	getCell,
	placePiece,
	serializeBoard,
	setCell,
} from '$/games/falling-blocks/domain/board';

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

	test('clears one through four complete rows and compacts the board', () => {
		for (let count = 1; count <= 4; count += 1) {
			const board = createEmptyBoard();
			for (
				let y = BOARD_INTERNAL_HEIGHT - count;
				y < BOARD_INTERNAL_HEIGHT;
				y += 1
			) {
				for (let x = 0; x < BOARD_WIDTH; x += 1) setCell(board, x, y, 8);
			}
			expect(clearLines(board)).toBe(count);
			expect(board.cells.every((cell) => cell === 0)).toBe(true);
		}
	});
});
