import type { BoardState, PiecePosition } from './board';
import { getCell } from './board';

export type TSpinKind = 'none' | 'mini' | 'full';

export interface PlacementScore {
	points: number;
	attack: number;
	combo: number;
	backToBack: boolean;
	backToBackBonus: boolean;
	perfectClear: boolean;
	tSpin: TSpinKind;
}

const BASE_SCORES = [0, 100, 300, 500, 800] as const;
const TSPIN_SCORES = {
	mini: [100, 200, 0, 0] as const,
	full: [400, 800, 1200, 1600] as const,
} as const;
const ATTACKS = [0, 0, 1, 2, 4] as const;

export const comboBonus = (combo: number): number =>
	combo < 2 ? 0 : Math.min(4, Math.floor((combo - 2) / 2) + 1);

export const detectTSpin = (
	board: BoardState,
	piece: PiecePosition,
	wasRotation: boolean,
	kickIndex: number,
): TSpinKind => {
	if (piece.kind !== 'T' || !wasRotation) return 'none';
	const corners: readonly (readonly [number, number])[] = [
		[piece.x, piece.y],
		[piece.x + 2, piece.y],
		[piece.x, piece.y + 2],
		[piece.x + 2, piece.y + 2],
	];
	const occupied = corners.filter(([x, y]) =>
		x < 0 || x >= 10 || y < 0 || y >= 24 ? true : getCell(board, x, y) !== 0,
	).length;
	if (occupied < 3) return 'none';
	const frontIndices =
		piece.rotation === 0
			? [0, 1]
			: piece.rotation === 1
				? [1, 3]
				: piece.rotation === 2
					? [2, 3]
					: [0, 2];
	const frontOccupied = frontIndices.filter((index) => {
		const corner = corners[index];
		return (
			corner !== undefined &&
			(corner[0] < 0 ||
				corner[0] >= 10 ||
				corner[1] < 0 ||
				corner[1] >= 24 ||
				getCell(board, corner[0], corner[1]) !== 0)
		);
	}).length;
	return frontOccupied === 2 || kickIndex === 4 ? 'full' : 'mini';
};

export const scorePlacement = (
	lines: number,
	level: number,
	combo: number,
	backToBack: boolean,
	tSpin: TSpinKind,
	perfectClear: boolean,
): PlacementScore => {
	const nextCombo = lines > 0 ? combo + 1 : -1;
	const eligible = lines === 4 || (tSpin !== 'none' && lines > 0);
	const backToBackBonus = eligible && backToBack;
	const base =
		tSpin === 'none'
			? (BASE_SCORES[lines] ?? 0)
			: (TSPIN_SCORES[tSpin][lines] ?? 0);
	const points = base * (level + 1);
	const attack =
		(tSpin === 'none'
			? (ATTACKS[lines] ?? 0)
			: tSpin === 'mini'
				? lines === 1
					? 1
					: 0
				: ([0, 2, 4, 6][lines] ?? 0)) +
		comboBonus(nextCombo) +
		(backToBackBonus ? 1 : 0) +
		(perfectClear ? 10 : 0);
	return {
		points,
		attack,
		combo: nextCombo,
		backToBack: eligible ? true : lines > 0 ? false : backToBack,
		backToBackBonus,
		perfectClear,
		tSpin,
	};
};
