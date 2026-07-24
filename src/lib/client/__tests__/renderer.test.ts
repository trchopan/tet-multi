import { describe, expect, test } from 'bun:test';
import {
	BOARD_HIDDEN_HEIGHT,
	BOARD_VISIBLE_HEIGHT,
	BOARD_WIDTH,
} from '../../../shared/constants';
import {
	cloneEngineState,
	createEngineState,
	hashEngineState,
} from '../../../game/engine';
import {
	getCanvasMetrics,
	getGhostPosition,
	getVisibleCellRect,
	snapshotToBoardState,
} from '../renderer';
import type { PlayerSnapshot } from '../../../shared/types';

describe('local canvas renderer geometry', () => {
	test('uses a 10 by 20 visible board with hidden rows cropped', () => {
		const metrics = getCanvasMetrics(300, 600);
		expect(metrics.cellWidth).toBe(30);
		expect(metrics.cellHeight).toBe(30);
		expect(getVisibleCellRect(metrics, 0, BOARD_HIDDEN_HEIGHT)).toEqual({
			x: 0,
			y: 0,
			width: 30,
			height: 30,
		});
		expect(
			getVisibleCellRect(
				metrics,
				BOARD_WIDTH - 1,
				BOARD_HIDDEN_HEIGHT + BOARD_VISIBLE_HEIGHT - 1,
			),
		).toEqual({ x: 270, y: 570, width: 30, height: 30 });
		expect(
			getVisibleCellRect(metrics, 0, BOARD_HIDDEN_HEIGHT - 1),
		).toBeUndefined();
	});

	test('scales backing dimensions for device pixels', () => {
		const metrics = getCanvasMetrics(320, 640, 2);
		expect(metrics.pixelWidth).toBe(640);
		expect(metrics.pixelHeight).toBe(1280);
	});

	test('derives a ghost without mutating the engine state', () => {
		const state = createEngineState('renderer-test');
		const before = cloneEngineState(state);
		const beforeHash = hashEngineState(state);
		const ghost = getGhostPosition(state);
		expect(ghost.y).toBeGreaterThanOrEqual(state.activePiece.y);
		expect(state).toEqual(before);
		expect(hashEngineState(state)).toBe(beforeHash);
	});

	test('converts authoritative snapshots without drawing hidden rows', () => {
		const player: PlayerSnapshot = {
			playerId: 'player-1',
			displayName: 'Alice',
			shortId: 'p1',
			playerType: 'human',
			joinedAt: 0,
			connected: true,
			ready: true,
			isHost: true,
			matchState: 'playing',
			board: Array.from({ length: 240 }, (_, index) => (index === 40 ? 8 : 0)),
			activePiece: { kind: 'I', x: 3, y: 4, rotation: 0 },
		};
		const state = snapshotToBoardState(player);
		expect(state.board.cells[40]).toBe(8);
		expect(state.activePiece?.y).toBe(4);
		expect(state.gameOver).toBe(false);
	});
});
