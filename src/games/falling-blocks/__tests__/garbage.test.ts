import { describe, expect, test } from 'bun:test';
import { BOARD_INTERNAL_HEIGHT, BOARD_WIDTH } from '../constants';
import { addGarbage, createEmptyBoard, getCell, setCell } from '../board';
import {
	cancelIncomingGarbage,
	cloneEngineState,
	createEngineState,
	enqueueGarbage,
	hardDrop,
	lockActivePiece,
	resolveReadyGarbage,
	serializeEngineState,
	deserializeEngineState,
} from '../core-engine';
import {
	cancelGarbage,
	createGarbagePacket,
	enqueueGarbage as enqueuePacket,
	readyGarbage,
	type GarbagePacket,
} from '../garbage';

describe('deterministic garbage rules', () => {
	test('packets activate after exactly thirty fixed ticks', () => {
		const packet = createGarbagePacket(2, 4, 0);
		const queue = [packet];
		expect(readyGarbage(queue, 29)).toEqual([]);
		expect(readyGarbage(queue, 30)).toEqual([packet]);
	});

	test('cancellation consumes oldest packets first and preserves remainder', () => {
		const queue: GarbagePacket[] = [];
		enqueuePacket(queue, createGarbagePacket(2, 1, 0));
		enqueuePacket(queue, createGarbagePacket(3, 2, 0));
		expect(cancelGarbage(queue, 3)).toBe(3);
		expect(queue).toEqual([{ lines: 2, hole: 2, readyTick: 30 }]);
	});

	test('garbage rows share one hole and shift the board upward', () => {
		const board = createEmptyBoard();
		setCell(board, 0, 0, 1);
		setCell(board, 1, 5, 2);
		expect(addGarbage(board, 2, 3)).toBe(true);
		expect(getCell(board, 1, 3)).toBe(2);
		expect(getCell(board, 3, BOARD_INTERNAL_HEIGHT - 1)).toBe(0);
		expect(getCell(board, 2, BOARD_INTERNAL_HEIGHT - 1)).toBe(8);
		expect(getCell(board, 3, BOARD_INTERNAL_HEIGHT - 2)).toBe(0);
	});

	test('garbage does not top out when the shifted cells fit', () => {
		const board = createEmptyBoard();
		setCell(board, 0, 3, 1);
		expect(addGarbage(board, 1, 0)).toBe(false);
		expect(getCell(board, 0, 2)).toBe(1);
	});

	test('ready garbage tops out and is included in engine serialization', () => {
		const state = createEngineState('garbage-state');
		enqueueGarbage(state, 1, 2, 0);
		state.currentTick = 30;
		setCell(state.board, 0, 0, 1);
		state.activePiece = { kind: 'O', x: 4, y: 22, rotation: 0 };
		expect(lockActivePiece(state)).toBe(true);
		expect(state.gameOver).toBe(true);
		expect(state.incomingGarbage).toEqual([]);
		const restored = deserializeEngineState(serializeEngineState(state));
		expect(restored).toEqual(state);
	});

	test('engine garbage cancellation and cloning are deterministic', () => {
		const first = createEngineState('garbage-replay');
		const second = cloneEngineState(first);
		enqueueGarbage(first, 4, 1, 0);
		enqueueGarbage(second, 4, 1, 0);
		expect(cancelIncomingGarbage(first, 2)).toBe(2);
		expect(cancelIncomingGarbage(second, 2)).toBe(2);
		expect(serializeEngineState(first)).toBe(serializeEngineState(second));
	});

	test('deferred lock resolution allows cancellation before ready garbage rises', () => {
		const state = createEngineState('deferred-garbage');
		enqueueGarbage(state, 1, 2, 0);
		state.currentTick = 30;
		hardDrop(state, false);
		expect(state.incomingGarbage).toHaveLength(1);
		expect(cancelIncomingGarbage(state, 1)).toBe(1);
		expect(resolveReadyGarbage(state)).toBe(false);
		expect(state.incomingGarbage).toEqual([]);
	});

	test('rejects invalid garbage holes and line counts', () => {
		expect(() => createGarbagePacket(0, 0, 0)).toThrow();
		expect(() => createGarbagePacket(25, 0, 0)).toThrow();
		expect(() => createGarbagePacket(1, BOARD_WIDTH, 0)).toThrow();
		expect(() => addGarbage(createEmptyBoard(), 0, 0)).toThrow();
	});
});
