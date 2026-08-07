import type { PlayerSnapshot } from '$/shared/types';

export const INTERPOLATION_DELAY_MS = 100;
export const MAX_OPPONENT_EXTRAPOLATION_MS = 150;

interface TimedSnapshot {
	snapshot: PlayerSnapshot;
	time: number;
}

const sameBoard = (first: PlayerSnapshot, second: PlayerSnapshot): boolean =>
	first.board?.every((cell, index) => cell === second.board?.[index]) ??
	first.board === second.board;

export const shouldSnapOpponent = (
	previous: PlayerSnapshot,
	current: PlayerSnapshot,
): boolean =>
	previous.matchState !== current.matchState ||
	previous.connected !== current.connected ||
	previous.activePiece?.kind !== current.activePiece?.kind ||
	previous.activePiece?.rotation !== current.activePiece?.rotation ||
	previous.activePiece?.x !== current.activePiece?.x ||
	!sameBoard(previous, current) ||
	(previous.incomingGarbage ?? 0) !== (current.incomingGarbage ?? 0) ||
	previous.matchState === 'eliminated';

export const interpolateOpponent = (
	previous: TimedSnapshot,
	current: TimedSnapshot,
	renderServerTime: number,
): PlayerSnapshot => {
	if (
		shouldSnapOpponent(previous.snapshot, current.snapshot) ||
		current.time <= previous.time
	)
		return {
			...current.snapshot,
			...(current.snapshot.activePiece === undefined
				? {}
				: { activePiece: { ...current.snapshot.activePiece } }),
		};

	const duration = current.time - previous.time;
	const target = Math.min(
		renderServerTime,
		current.time,
		current.time + MAX_OPPONENT_EXTRAPOLATION_MS,
	);
	const progress = Math.max(
		0,
		Math.min(1, (target - previous.time) / duration),
	);
	const previousPiece = previous.snapshot.activePiece;
	const currentPiece = current.snapshot.activePiece;
	if (previousPiece === undefined || currentPiece === undefined)
		return { ...current.snapshot };
	return {
		...current.snapshot,
		activePiece: {
			...currentPiece,
			y: previousPiece.y + (currentPiece.y - previousPiece.y) * progress,
		},
	};
};

export type SnapshotHistory = Map<
	string,
	{ previous?: TimedSnapshot; current: TimedSnapshot }
>;

export const recordSnapshot = (
	history: SnapshotHistory,
	players: readonly PlayerSnapshot[],
	serverTime: number,
): void => {
	for (const player of players) {
		const existing = history.get(player.playerId);
		const current = { snapshot: { ...player }, time: serverTime };
		history.set(
			player.playerId,
			existing === undefined
				? { current }
				: { previous: existing.current, current },
		);
	}
};

export const renderInterpolatedPlayer = (
	history: SnapshotHistory,
	player: PlayerSnapshot,
	renderServerTime: number,
): PlayerSnapshot => {
	const entry = history.get(player.playerId);
	if (entry?.previous === undefined) return { ...player };
	return interpolateOpponent(entry.previous, entry.current, renderServerTime);
};
