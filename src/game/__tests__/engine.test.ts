import { describe, expect, test } from 'bun:test';
import {
	applyHorizontalInput,
	cloneEngineState,
	createEngineState,
	deserializeEngineState,
	hashEngineState,
	lockActivePiece,
	serializeEngineState,
} from '../engine';

describe('deterministic engine foundation', () => {
	test('same seed, roster, and inputs produce the same hash', () => {
		const first = createEngineState('replay-seed', 1);
		const second = createEngineState('replay-seed', 1);
		const inputs = [
			'move_left',
			'move_left',
			'move_right',
			'move_right',
		] as const;
		for (const input of inputs) {
			applyHorizontalInput(first, input);
			applyHorizontalInput(second, input);
		}
		expect(hashEngineState(first)).toBe(hashEngineState(second));
	});

	test('different engine states produce different hashes', () => {
		const state = createEngineState('hash-seed');
		const initialHash = hashEngineState(state);
		expect(applyHorizontalInput(state, 'move_right')).toBe(true);
		expect(hashEngineState(state)).not.toBe(initialHash);
		expect(hashEngineState(createEngineState('other-hash-seed'))).not.toBe(
			initialHash,
		);
	});

	test('horizontal movement stops at the wall', () => {
		const state = createEngineState('movement-seed');
		while (applyHorizontalInput(state, 'move_left')) {
			// Move until the active piece reaches its legal boundary.
		}
		const stoppedHash = hashEngineState(state);
		expect(applyHorizontalInput(state, 'move_left')).toBe(false);
		expect(hashEngineState(state)).toBe(stoppedHash);
	});

	test('serialization round trips without changing the hash', () => {
		const state = createEngineState('serialization-seed', 3);
		applyHorizontalInput(state, 'move_right');
		const restored = deserializeEngineState(serializeEngineState(state));
		expect(restored).toEqual(state);
		expect(hashEngineState(restored)).toBe(hashEngineState(state));
	});

	test('rejects malformed serialized engine state', () => {
		const serialized = JSON.parse(
			serializeEngineState(createEngineState('validation-seed')),
		) as Record<string, unknown>;
		const malformedBoard = { ...serialized, board: [0] };
		const malformedPiece = {
			...serialized,
			activePiece: { kind: 'invalid', x: 3, y: 0, rotation: 0 },
		};
		const malformedBag = {
			...serialized,
			bag: { seed: 'validation-seed', rosterIndex: 0 },
		};

		expect(() =>
			deserializeEngineState(JSON.stringify(malformedBoard)),
		).toThrow();
		expect(() =>
			deserializeEngineState(JSON.stringify(malformedPiece)),
		).toThrow();
		expect(() =>
			deserializeEngineState(JSON.stringify(malformedBag)),
		).toThrow();
	});

	test('locking places the active piece and advances the bag', () => {
		const state = createEngineState('lock-seed');
		const before = cloneEngineState(state);
		expect(lockActivePiece(state)).toBe(true);
		expect(state.board.cells).not.toEqual(before.board.cells);
		expect(state.activePiece).not.toEqual(before.activePiece);
	});
});
