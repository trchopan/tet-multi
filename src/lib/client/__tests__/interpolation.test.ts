import { describe, expect, test } from 'bun:test';
import {
	interpolateOpponent,
	recordSnapshot,
	type SnapshotHistory,
} from '../interpolation';
import type { PlayerSnapshot } from '../../../shared/types';

const snapshot = (y: number, board = Array(240).fill(0)): PlayerSnapshot => ({
	playerId: 'player-2',
	displayName: 'Bob',
	shortId: 'p2',
	joinedAt: 0,
	connected: true,
	ready: true,
	isHost: false,
	matchState: 'playing',
	board,
	activePiece: { kind: 'T', x: 3, y, rotation: 0 },
});

describe('opponent interpolation', () => {
	test('interpolates active-piece vertical movement', () => {
		const previous = { snapshot: snapshot(4), time: 1000 };
		const current = { snapshot: snapshot(6), time: 1100 };
		expect(interpolateOpponent(previous, current, 1050).activePiece?.y).toBe(5);
	});

	test('snaps after a board change', () => {
		const previous = { snapshot: snapshot(4), time: 1000 };
		const board = Array(240).fill(0);
		board[239] = 8;
		const current = { snapshot: snapshot(6, board), time: 1100 };
		expect(interpolateOpponent(previous, current, 1050).activePiece?.y).toBe(6);
	});

	test('does not extrapolate beyond the newest snapshot', () => {
		const previous = { snapshot: snapshot(4), time: 1000 };
		const current = { snapshot: snapshot(6), time: 1100 };
		expect(interpolateOpponent(previous, current, 1300).activePiece?.y).toBe(6);
	});

	test('records a stable two-snapshot history', () => {
		const history: SnapshotHistory = new Map();
		recordSnapshot(history, [snapshot(4)], 1000);
		recordSnapshot(history, [snapshot(6)], 1100);
		expect(history.get('player-2')?.previous?.time).toBe(1000);
	});
});
