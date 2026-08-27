import { describe, expect, test } from 'bun:test';
import {
	createRandomState,
	nextRandom,
	nextRandomIndex,
} from '$/shared/random';

describe('shared deterministic PRNG', () => {
	test('same seed and index produce identical numbers', () => {
		const s1 = createRandomState('seed-a', 1);
		const s2 = createRandomState('seed-a', 1);
		const v1 = [nextRandom(s1), nextRandomIndex(s1, 100)];
		const v2 = [nextRandom(s2), nextRandomIndex(s2, 100)];
		expect(v1).toEqual(v2);
	});

	test('different roster index produces different stream', () => {
		const s1 = createRandomState('seed-a', 0);
		const s2 = createRandomState('seed-a', 1);
		expect(nextRandom(s1)).not.toEqual(nextRandom(s2));
	});
});
