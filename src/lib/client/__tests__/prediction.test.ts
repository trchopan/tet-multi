import { describe, expect, test } from 'bun:test';
import {
	reconcilePrediction,
	predictionToSnapshot,
	type PendingInput,
} from '../prediction';
import type { PlayerSnapshot } from '../../../shared/types';

const player = (): PlayerSnapshot => ({
	playerId: 'player-1',
	displayName: 'Alice',
	shortId: 'p1',
	playerType: 'human',
	joinedAt: 0,
	connected: true,
	ready: true,
	isHost: true,
	matchState: 'playing',
	board: Array(240).fill(0),
	activePiece: { kind: 'I', x: 3, y: 4, rotation: 0 },
	hold: 'O',
	next: ['J', 'L', 'S', 'T', 'Z'],
	lastProcessedInput: 1,
});

describe('local prediction reconciliation', () => {
	test('acknowledges inputs and reapplies only pending movement', () => {
		const pending: PendingInput[] = [
			{ sequence: 1, action: 'move_left' },
			{ sequence: 2, action: 'move_right' },
		];
		const result = reconcilePrediction(player(), pending);
		expect(result?.pending).toEqual([pending[1]!]);
		expect(result?.state.activePiece.x).toBe(4);
	});

	test('does not predict hard-drop consequences', () => {
		const result = reconcilePrediction(player(), [
			{ sequence: 2, action: 'hard_drop' },
		]);
		expect(result?.state.activePiece.y).toBe(4);
		expect(predictionToSnapshot(player(), result!.state).score).toBeUndefined();
	});

	test('rebuilds from authoritative board data', () => {
		const authoritative = player();
		if (authoritative.board === undefined) throw new Error('board missing');
		authoritative.board[23 * 10] = 8;
		const result = reconcilePrediction(authoritative, []);
		expect(result?.state.board.cells[230]).toBe(8);
	});
});
