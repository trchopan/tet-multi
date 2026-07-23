import { PIECE_KINDS } from '../shared/constants';
import type { PieceKind } from '../shared/types';

export interface RandomState {
	state: number;
}

export interface SevenBagState {
	seed: string;
	rosterIndex: number;
	random: RandomState;
	remaining: PieceKind[];
}

const UINT32_RANGE = 0x1_0000_0000;

const hashSeed = (seed: string): number => {
	let hash = 0x811c9dc5;
	for (let index = 0; index < seed.length; index += 1) {
		hash ^= seed.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
};

const streamSeed = (seed: string, rosterIndex: number): number =>
	hashSeed(`${seed}\u0000${rosterIndex}`) || 0x6d2b79f5;

export const createRandomState = (
	seed: string,
	rosterIndex = 0,
): RandomState => {
	if (!Number.isInteger(rosterIndex) || rosterIndex < 0) {
		throw new RangeError('rosterIndex must be a non-negative integer');
	}
	return { state: streamSeed(seed, rosterIndex) };
};

export const nextRandom = (random: RandomState): number => {
	let value = (random.state + 0x6d2b79f5) >>> 0;
	value = Math.imul(value ^ (value >>> 15), value | 1);
	value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
	random.state = (value ^ (value >>> 14)) >>> 0;
	return random.state / UINT32_RANGE;
};

const nextIndex = (random: RandomState, exclusiveMaximum: number): number =>
	Math.floor(nextRandom(random) * exclusiveMaximum);

const refillBag = (random: RandomState): PieceKind[] => {
	const bag = [...PIECE_KINDS];
	for (let index = bag.length - 1; index > 0; index -= 1) {
		const swapIndex = nextIndex(random, index + 1);
		const current = bag[index];
		const swapped = bag[swapIndex];
		if (current === undefined || swapped === undefined) {
			throw new Error('Seven-bag shuffle index is out of range');
		}
		bag[index] = swapped;
		bag[swapIndex] = current;
	}
	return bag;
};

export const createSevenBag = (
	seed: string,
	rosterIndex = 0,
): SevenBagState => {
	const random = createRandomState(seed, rosterIndex);
	return {
		seed,
		rosterIndex,
		random,
		remaining: refillBag(random),
	};
};

export const drawPiece = (bag: SevenBagState): PieceKind => {
	if (bag.remaining.length === 0) {
		bag.remaining = refillBag(bag.random);
	}
	const piece = bag.remaining.shift();
	if (piece === undefined) {
		throw new Error('Seven-bag refill produced no piece');
	}
	return piece;
};

export const cloneSevenBag = (bag: SevenBagState): SevenBagState => ({
	seed: bag.seed,
	rosterIndex: bag.rosterIndex,
	random: { state: bag.random.state },
	remaining: [...bag.remaining],
});
