import { describe, expect, test } from 'bun:test';
import { PIECE_KINDS } from '../constants';
import { getPieceDefinition, pieceValue } from '../domain/pieces';

describe('tetromino definitions', () => {
	test('defines four cells, numeric values, and legal spawn positions', () => {
		for (const kind of PIECE_KINDS) {
			const definition = getPieceDefinition(kind);
			expect(definition.spawnCells).toHaveLength(4);
			expect(pieceValue(kind)).toBeGreaterThan(0);
			expect(definition.spawnX).toBeGreaterThanOrEqual(0);
			expect(definition.spawnX).toBeLessThan(10);
			expect(definition.spawnY).toBeGreaterThanOrEqual(0);
		}
	});

	test('uses the protocol piece-value mapping', () => {
		expect(PIECE_KINDS.map(pieceValue)).toEqual([1, 2, 3, 4, 5, 6, 7]);
	});
});
