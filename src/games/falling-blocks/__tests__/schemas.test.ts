import { describe, expect, test } from 'bun:test';
import { safeParse } from 'valibot';
import {
	activePieceSchema,
	fallingBlocksPlayerSnapshotSchema,
} from '../schemas';
import { BOARD_CELL_COUNT, NEXT_PREVIEW_COUNT } from '../constants';

describe('falling-blocks schema validation', () => {
	test('validates valid active piece', () => {
		const validPiece = {
			kind: 'I',
			x: 3,
			y: 0,
			rotation: 0,
		};
		expect(safeParse(activePieceSchema, validPiece).success).toBe(true);
	});

	test('rejects invalid active piece rotation or coordinates', () => {
		expect(
			safeParse(activePieceSchema, { kind: 'I', x: 3.5, y: 0, rotation: 0 })
				.success,
		).toBe(false);
		expect(
			safeParse(activePieceSchema, { kind: 'I', x: 3, y: 0, rotation: 5 })
				.success,
		).toBe(false);
	});

	test('validates falling blocks player snapshot fields', () => {
		const validPlayerState = {
			next: Array.from({ length: NEXT_PREVIEW_COUNT }, () => 'I'),
			hold: 'T',
			score: 1000,
			lines: 4,
			level: 1,
			combo: 2,
			maxCombo: 5,
			backToBack: true,
			board: Array.from({ length: BOARD_CELL_COUNT }, () => 0),
		};
		expect(
			safeParse(fallingBlocksPlayerSnapshotSchema, validPlayerState).success,
		).toBe(true);
	});

	test('rejects malformed board or next queue size', () => {
		expect(
			safeParse(fallingBlocksPlayerSnapshotSchema, {
				next: ['I'],
			}).success,
		).toBe(false);

		expect(
			safeParse(fallingBlocksPlayerSnapshotSchema, {
				board: [0, 1, 2],
			}).success,
		).toBe(false);
	});
});
