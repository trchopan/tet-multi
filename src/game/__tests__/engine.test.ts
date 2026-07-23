import { describe, expect, test } from 'bun:test';
import {
	applyHorizontalInput,
	advanceTicks,
	applyInput,
	applyRotation,
	cloneEngineState,
	createEngineState,
	deserializeEngineState,
	hashEngineState,
	lockActivePiece,
	hardDrop,
	holdPiece,
	softDrop,
	serializeEngineState,
} from '../engine';
import { BOARD_WIDTH } from '../../shared/constants';
import { setCell } from '../board';

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
		const missingScore = { ...serialized };
		delete missingScore.score;
		const malformedTimer = { ...serialized, lockMs: -1 };

		expect(() =>
			deserializeEngineState(JSON.stringify(malformedBoard)),
		).toThrow();
		expect(() =>
			deserializeEngineState(JSON.stringify(malformedPiece)),
		).toThrow();
		expect(() =>
			deserializeEngineState(JSON.stringify(malformedBag)),
		).toThrow();
		expect(() =>
			deserializeEngineState(JSON.stringify(missingScore)),
		).toThrow();
		expect(() =>
			deserializeEngineState(JSON.stringify(malformedTimer)),
		).toThrow();
	});

	test('locking places the active piece and advances the bag', () => {
		const state = createEngineState('lock-seed');
		const before = cloneEngineState(state);
		expect(lockActivePiece(state)).toBe(true);
		expect(state.board.cells).not.toEqual(before.board.cells);
		expect(state.activePiece).not.toEqual(before.activePiece);
	});

	test('rotation uses SRS at a wall and floor', () => {
		const wall = createEngineState('rotation-wall');
		wall.activePiece = { kind: 'I', x: 3, y: 4, rotation: 0 };
		while (moveLeft(wall)) {}
		expect(applyRotation(wall, true)).toBe(true);

		const floor = createEngineState('rotation-floor');
		floor.activePiece = { kind: 'I', x: 3, y: 20, rotation: 0 };
		expect(applyRotation(floor, true)).toBe(true);
	});

	test('rotation rejects a piece when every kick is blocked', () => {
		const state = createEngineState('rotation-blocked');
		state.activePiece = { kind: 'T', x: 3, y: 4, rotation: 0 };
		for (let y = 4; y <= 7; y += 1) {
			for (let x = 2; x <= 7; x += 1) setCell(state.board, x, y, 8);
		}
		for (const cell of [
			[4, 4],
			[3, 5],
			[4, 5],
			[5, 5],
		] as const)
			setCell(state.board, cell[0], cell[1], 0);
		expect(applyRotation(state, true)).toBe(false);
	});

	test('rotation uses a stack kick when the initial test is blocked', () => {
		const state = createEngineState('rotation-stack');
		state.activePiece = { kind: 'T', x: 3, y: 20, rotation: 0 };
		setCell(state.board, 4, 22, 8);
		expect(applyRotation(state, true)).toBe(true);
		expect(state.activePiece.x).toBe(2);
	});

	test('gravity and lock delay advance only on fixed ticks', () => {
		const state = createEngineState('timing-seed');
		const startY = state.activePiece.y;
		advanceTicks(state, 48);
		expect(state.activePiece.y).toBe(startY);
		advanceTicks(state, 1);
		expect(state.activePiece.y).toBe(startY + 1);
		state.activePiece.y = 22;
		advanceTicks(state, 29);
		expect(state.board.cells.every((cell) => cell === 0)).toBe(true);
		advanceTicks(state, 2);
		expect(state.board.cells.some((cell) => cell !== 0)).toBe(true);
	});

	test('gravity does not erase the most recent rotation action', () => {
		const state = createEngineState('rotation-memory');
		state.activePiece = { kind: 'T', x: 3, y: 4, rotation: 0 };
		state.lastActionWasRotation = true;
		advanceTicks(state, 49);
		expect(state.activePiece.y).toBeGreaterThan(4);
		expect(state.lastActionWasRotation).toBe(true);
	});

	test('grounded movement resets lock delay only fifteen times', () => {
		const state = createEngineState('reset-limit');
		state.activePiece = { kind: 'O', x: 4, y: 22, rotation: 0 };
		state.lockMs = 400;
		for (let index = 0; index < 15; index += 1) {
			expect(
				applyHorizontalInput(
					state,
					index % 2 === 0 ? 'move_left' : 'move_right',
				),
			).toBe(true);
		}
		expect(state.groundedResets).toBe(15);
		expect(state.lockMs).toBe(0);
		state.lockMs = 400;
		expect(applyHorizontalInput(state, 'move_left')).toBe(true);
		expect(state.lockMs).toBe(400);
	});

	test('soft and hard drop award distance points', () => {
		const state = createEngineState('drop-seed');
		expect(softDrop(state)).toBe(true);
		expect(state.score).toBe(1);
		const before = state.score;
		const distance = hardDrop(state);
		expect(distance).toBeGreaterThan(0);
		expect(state.score).toBe(before + distance * 2);
	});

	test('hold is limited to one use per active piece and refills preview', () => {
		const state = createEngineState('hold-seed');
		const current = state.activePiece.kind;
		const nextBefore = [...state.next];
		const firstNext = nextBefore[0];
		if (firstNext === undefined) throw new Error('preview is empty');
		expect(holdPiece(state)).toBe(true);
		expect(state.hold).toBe(current);
		expect(state.activePiece.kind).toBe(firstNext);
		expect(state.next).toHaveLength(5);
		expect(holdPiece(state)).toBe(false);
		hardDrop(state);
		expect(holdPiece(state)).toBe(true);
	});

	test('line clear updates score, level, and perfect-clear metadata', () => {
		const state = createEngineState('clear-seed');
		state.activePiece = { kind: 'I', x: 0, y: 22, rotation: 0 };
		for (let x = 4; x < BOARD_WIDTH; x += 1) setCell(state.board, x, 23, 8);
		expect(lockActivePiece(state)).toBe(true);
		expect(state.lines).toBe(1);
		expect(state.score).toBe(100);
		expect(state.combo).toBe(0);
		expect(state.lastPlacement?.perfectClear).toBe(true);
	});

	test('locking with a blocked next spawn causes a game over', () => {
		const state = createEngineState('spawn-collision-seed');
		state.activePiece = { kind: 'O', x: 4, y: 22, rotation: 0 };
		for (let x = 0; x < 6; x += 1) setCell(state.board, x, 0, 8);
		for (let x = 0; x < BOARD_WIDTH - 1; x += 1) setCell(state.board, x, 1, 8);
		expect(lockActivePiece(state)).toBe(true);
		expect(state.gameOver).toBe(true);
	});

	test('a scripted input replay remains deterministic', () => {
		const first = createEngineState('known-replay', 2);
		const second = createEngineState('known-replay', 2);
		const inputs = [
			'move_left',
			'rotate_cw',
			'soft_drop',
			'move_right',
			'rotate_ccw',
			'hard_drop',
			'hold',
		] as const;
		for (const input of inputs) {
			applyInput(first, input);
			applyInput(second, input);
			advanceTicks(first, 3);
			advanceTicks(second, 3);
		}
		expect(hashEngineState(first)).toBe(hashEngineState(second));
	});
});

const moveLeft = (state: ReturnType<typeof createEngineState>): boolean =>
	applyHorizontalInput(state, 'move_left');
