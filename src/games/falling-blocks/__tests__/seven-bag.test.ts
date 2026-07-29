import { describe, expect, test } from 'bun:test';
import { PIECE_KINDS } from '../../../shared/constants';
import { createSevenBag, drawPiece } from '../seven-bag';

const draw = (seed: string, rosterIndex: number, count: number) => {
	const bag = createSevenBag(seed, rosterIndex);
	return Array.from({ length: count }, () => drawPiece(bag));
};

describe('deterministic random streams', () => {
	test('each seven-bag contains every piece exactly once', () => {
		const sequence = draw('match-seed', 0, PIECE_KINDS.length * 3);
		for (
			let offset = 0;
			offset < sequence.length;
			offset += PIECE_KINDS.length
		) {
			expect(
				[...sequence.slice(offset, offset + PIECE_KINDS.length)].sort(),
			).toEqual([...PIECE_KINDS].sort());
		}
	});

	test('same seed and roster index produce the same sequence', () => {
		expect(draw('match-seed', 2, 30)).toEqual(draw('match-seed', 2, 30));
	});

	test('different seeds generally produce different sequences', () => {
		expect(draw('match-seed-a', 0, 30)).not.toEqual(
			draw('match-seed-b', 0, 30),
		);
	});

	test('roster indexes create independent deterministic streams', () => {
		expect(draw('match-seed', 0, 30)).not.toEqual(draw('match-seed', 1, 30));
		expect(draw('match-seed', 0, 30)).toEqual(draw('match-seed', 0, 30));
	});
});
