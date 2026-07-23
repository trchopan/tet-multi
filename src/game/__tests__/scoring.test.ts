import { describe, expect, test } from 'bun:test';
import { createEmptyBoard, setCell } from '../board';
import { detectTSpin, scorePlacement } from '../scoring';

describe('engine scoring rules', () => {
	test('combo starts at zero after a clear and adds the documented bonuses', () => {
		expect(scorePlacement(1, 0, -1, false, 'none', false).combo).toBe(0);
		expect(scorePlacement(1, 0, 0, false, 'none', false).attack).toBe(0);
		expect(scorePlacement(1, 0, 1, false, 'none', false).attack).toBe(1);
		expect(scorePlacement(0, 0, 4, false, 'none', false).combo).toBe(-1);
	});

	test('back-to-back applies to consecutive tetrises and T-spin clears', () => {
		const first = scorePlacement(4, 0, -1, false, 'none', false);
		const second = scorePlacement(
			4,
			0,
			first.combo,
			first.backToBack,
			'none',
			false,
		);
		expect(first.backToBackBonus).toBe(false);
		expect(second.backToBackBonus).toBe(true);
		expect(second.attack).toBe(5);
		expect(scorePlacement(1, 0, -1, true, 'full', false).points).toBe(800);
	});

	test('uses the specified base values for every clear size', () => {
		expect(scorePlacement(1, 1, -1, false, 'none', false).points).toBe(200);
		expect(scorePlacement(2, 1, -1, false, 'none', false).points).toBe(600);
		expect(scorePlacement(3, 1, -1, false, 'none', false).points).toBe(1000);
		expect(scorePlacement(4, 1, -1, false, 'none', false).points).toBe(1600);
		expect(scorePlacement(0, 1, -1, false, 'mini', false).points).toBe(200);
	});

	test('classifies full and mini T-spins from final corners', () => {
		const full = createEmptyBoard();
		setCell(full, 3, 0, 8);
		setCell(full, 5, 0, 8);
		setCell(full, 3, 2, 8);
		expect(
			detectTSpin(full, { kind: 'T', x: 3, y: 0, rotation: 0 }, true, 0),
		).toBe('full');
		const mini = createEmptyBoard();
		setCell(mini, 3, 0, 8);
		setCell(mini, 3, 2, 8);
		setCell(mini, 5, 2, 8);
		expect(
			detectTSpin(mini, { kind: 'T', x: 3, y: 0, rotation: 0 }, true, 0),
		).toBe('mini');
	});

	test('uses the correct front corners in every rotation state', () => {
		const corners = [
			[3, 0],
			[5, 0],
			[3, 2],
			[5, 2],
		] as const;
		const miniCorners = [
			[0, 2, 3],
			[0, 1, 2],
			[0, 1, 2],
			[0, 1, 3],
		] as const;
		for (const rotation of [0, 1, 2, 3] as const) {
			const board = createEmptyBoard();
			for (const index of miniCorners[rotation]) {
				const corner = corners[index];
				if (corner) setCell(board, corner[0], corner[1], 8);
			}
			expect(
				detectTSpin(board, { kind: 'T', x: 3, y: 0, rotation }, true, 0),
			).toBe('mini');
		}
	});

	test('T-spin requires a rotation action and three occupied corners', () => {
		const board = createEmptyBoard();
		setCell(board, 3, 0, 8);
		setCell(board, 5, 0, 8);
		setCell(board, 3, 2, 8);
		expect(
			detectTSpin(board, { kind: 'T', x: 3, y: 0, rotation: 0 }, false, 0),
		).toBe('none');
	});
});
