import { PIECE_KINDS } from './constants';
import type { PieceKind } from './types';

export type PieceValue = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type PieceRotation = 0 | 1 | 2 | 3;

export interface PieceCell {
	x: number;
	y: number;
}

export interface PieceDefinition {
	kind: PieceKind;
	value: PieceValue;
	spawnX: number;
	spawnY: number;
	spawnCells: readonly PieceCell[];
}

export const getRotationCells = (
	kind: PieceKind,
	rotation: PieceRotation,
): readonly PieceCell[] => {
	const base = definitions[kind].spawnCells;
	if (kind === 'O') return base;
	if (kind === 'I') {
		return (
			[
				[
					{ x: 0, y: 1 },
					{ x: 1, y: 1 },
					{ x: 2, y: 1 },
					{ x: 3, y: 1 },
				],
				[
					{ x: 2, y: 0 },
					{ x: 2, y: 1 },
					{ x: 2, y: 2 },
					{ x: 2, y: 3 },
				],
				[
					{ x: 0, y: 2 },
					{ x: 1, y: 2 },
					{ x: 2, y: 2 },
					{ x: 3, y: 2 },
				],
				[
					{ x: 1, y: 0 },
					{ x: 1, y: 1 },
					{ x: 1, y: 2 },
					{ x: 1, y: 3 },
				],
			][rotation] ?? []
		);
	}
	if (rotation === 0) return base;
	const cells = base;
	let current = [...cells];
	for (let step = 0; step < rotation; step += 1) {
		current = current.map(({ x, y }) => ({ x: 2 - y, y: x }));
	}
	return current;
};

const definitions: Record<PieceKind, PieceDefinition> = {
	I: {
		kind: 'I',
		value: 1,
		spawnX: 3,
		spawnY: 0,
		spawnCells: [
			{ x: 0, y: 1 },
			{ x: 1, y: 1 },
			{ x: 2, y: 1 },
			{ x: 3, y: 1 },
		],
	},
	J: {
		kind: 'J',
		value: 2,
		spawnX: 3,
		spawnY: 0,
		spawnCells: [
			{ x: 0, y: 0 },
			{ x: 0, y: 1 },
			{ x: 1, y: 1 },
			{ x: 2, y: 1 },
		],
	},
	L: {
		kind: 'L',
		value: 3,
		spawnX: 3,
		spawnY: 0,
		spawnCells: [
			{ x: 2, y: 0 },
			{ x: 0, y: 1 },
			{ x: 1, y: 1 },
			{ x: 2, y: 1 },
		],
	},
	O: {
		kind: 'O',
		value: 4,
		spawnX: 4,
		spawnY: 0,
		spawnCells: [
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
			{ x: 0, y: 1 },
			{ x: 1, y: 1 },
		],
	},
	S: {
		kind: 'S',
		value: 5,
		spawnX: 3,
		spawnY: 0,
		spawnCells: [
			{ x: 1, y: 0 },
			{ x: 2, y: 0 },
			{ x: 0, y: 1 },
			{ x: 1, y: 1 },
		],
	},
	T: {
		kind: 'T',
		value: 6,
		spawnX: 3,
		spawnY: 0,
		spawnCells: [
			{ x: 1, y: 0 },
			{ x: 0, y: 1 },
			{ x: 1, y: 1 },
			{ x: 2, y: 1 },
		],
	},
	Z: {
		kind: 'Z',
		value: 7,
		spawnX: 3,
		spawnY: 0,
		spawnCells: [
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
			{ x: 1, y: 1 },
			{ x: 2, y: 1 },
		],
	},
};

export const getPieceDefinition = (kind: PieceKind): PieceDefinition =>
	definitions[kind];

export const pieceValue = (kind: PieceKind): PieceValue =>
	definitions[kind].value;

export const isPieceKind = (value: string): value is PieceKind =>
	(PIECE_KINDS as readonly string[]).includes(value);
