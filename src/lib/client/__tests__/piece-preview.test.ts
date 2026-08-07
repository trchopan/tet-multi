import { describe, expect, test } from 'bun:test';
import { PIECE_KINDS } from '../../../games/falling-blocks';
import { getPreviewCellIndexes } from '../piece-preview';
import { getPieceColor, PIECE_COLORS } from '../theme';

describe('piece previews', () => {
	test('normalizes every piece to four filled cells in the 4 by 2 preview', () => {
		for (const piece of PIECE_KINDS) {
			const cells = getPreviewCellIndexes(piece);
			expect(cells).toHaveLength(4);
			expect(new Set(cells).size).toBe(4);
			expect(cells.every((index) => index >= 0 && index < 8)).toBe(true);
		}
	});

	test('centers the two-cell O piece', () => {
		expect(getPreviewCellIndexes('O')).toEqual([1, 2, 5, 6]);
	});

	test('uses the same theme colors as the renderer palette', () => {
		const colorAt = (index: number): string => {
			const color = PIECE_COLORS[index];
			if (color === undefined)
				throw new Error(`Missing palette color ${index}`);
			return color;
		};
		expect(getPieceColor('I')).toBe(colorAt(1));
		expect(getPieceColor('T')).toBe(colorAt(6));
		expect(getPieceColor('Z')).toBe(colorAt(7));
	});
});
