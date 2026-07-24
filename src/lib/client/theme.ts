import type { PieceKind } from '../../shared/types';

export const PIECE_COLORS: readonly string[] = [
	'#10121c',
	'#35d9ff',
	'#5271ff',
	'#ff9f43',
	'#ffe66d',
	'#58e38c',
	'#c77dff',
	'#ff5c8a',
	'#8d96a8',
];

const PIECE_VALUES: Record<PieceKind, number> = {
	I: 1,
	J: 2,
	L: 3,
	O: 4,
	S: 5,
	T: 6,
	Z: 7,
};

export const getPieceColor = (piece: PieceKind): string =>
	PIECE_COLORS[PIECE_VALUES[piece]] ?? PIECE_COLORS[0] ?? '#10121c';
