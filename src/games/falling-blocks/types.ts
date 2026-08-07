import type { PIECE_KINDS } from './constants';

export type PieceKind = (typeof PIECE_KINDS)[number];

export interface ActivePieceSnapshot {
	kind: PieceKind;
	x: number;
	y: number;
	rotation: 0 | 1 | 2 | 3;
}

export interface FallingBlocksPlayerSnapshot {
	board?: number[];
	activePiece?: ActivePieceSnapshot;
	hold?: PieceKind;
	next?: PieceKind[];
	score?: number;
	lines?: number;
	level?: number;
	combo?: number;
	maxCombo?: number;
	backToBack?: boolean;
	attackSent?: number;
	incomingGarbage?: number;
	lastProcessedInput?: number;
}
