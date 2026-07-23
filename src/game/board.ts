import {
	BOARD_CELL_COUNT,
	BOARD_INTERNAL_HEIGHT,
	BOARD_WIDTH,
	SNAPSHOT_CELL_VALUES,
} from '../shared/constants';
import type { PieceKind } from '../shared/types';
import { getPieceDefinition, pieceValue } from './pieces';

export type BoardCell = (typeof SNAPSHOT_CELL_VALUES)[number];

export interface BoardState {
	cells: BoardCell[];
}

export interface PiecePosition {
	kind: PieceKind;
	x: number;
	y: number;
}

export const isBoardCell = (value: unknown): value is BoardCell =>
	typeof value === 'number' &&
	Number.isInteger(value) &&
	(SNAPSHOT_CELL_VALUES as readonly number[]).includes(value);

export const assertValidBoard = (board: BoardState): void => {
	if (
		board.cells.length !== BOARD_CELL_COUNT ||
		!board.cells.every((cell) => isBoardCell(cell))
	) {
		throw new RangeError('Board must contain 240 valid cells');
	}
};

export const boardIndex = (x: number, y: number): number => {
	if (!Number.isInteger(x) || !Number.isInteger(y)) {
		throw new RangeError('Board coordinates must be integers');
	}
	if (x < 0 || x >= BOARD_WIDTH || y < 0 || y >= BOARD_INTERNAL_HEIGHT) {
		throw new RangeError('Board coordinates are outside the internal board');
	}
	return y * BOARD_WIDTH + x;
};

export const createEmptyBoard = (): BoardState => ({
	cells: Array.from({ length: BOARD_CELL_COUNT }, () => 0),
});

export const cloneBoard = (board: BoardState): BoardState => ({
	cells: [...board.cells],
});

export const getCell = (board: BoardState, x: number, y: number): BoardCell =>
	board.cells[boardIndex(x, y)] ?? 0;

export const setCell = (
	board: BoardState,
	x: number,
	y: number,
	value: BoardCell,
): void => {
	if (!isBoardCell(value)) {
		throw new RangeError('Board cell value is invalid');
	}
	board.cells[boardIndex(x, y)] = value;
};

export const pieceCells = (
	piece: PiecePosition,
): ReadonlyArray<{ x: number; y: number }> => {
	const definition = getPieceDefinition(piece.kind);
	return definition.spawnCells.map((cell) => ({
		x: piece.x + cell.x,
		y: piece.y + cell.y,
	}));
};

export const canPlacePiece = (
	board: BoardState,
	piece: PiecePosition,
): boolean => {
	for (const cell of pieceCells(piece)) {
		if (
			cell.x < 0 ||
			cell.x >= BOARD_WIDTH ||
			cell.y < 0 ||
			cell.y >= BOARD_INTERNAL_HEIGHT ||
			getCell(board, cell.x, cell.y) !== 0
		) {
			return false;
		}
	}
	return true;
};

export const placePiece = (
	board: BoardState,
	piece: PiecePosition,
): boolean => {
	if (!canPlacePiece(board, piece)) {
		return false;
	}
	const value = pieceValue(piece.kind);
	for (const cell of pieceCells(piece)) {
		setCell(board, cell.x, cell.y, value);
	}
	return true;
};

export const serializeBoard = (board: BoardState): number[] => {
	assertValidBoard(board);
	return [...board.cells];
};
