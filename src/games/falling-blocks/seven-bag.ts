import { PIECE_KINDS } from './constants';
import type { PieceKind } from './types';
import {
	createRandomState,
	nextRandomIndex,
	type RandomState,
} from '../../shared/random';

export interface SevenBagState {
	seed: string;
	rosterIndex: number;
	random: RandomState;
	remaining: PieceKind[];
}

const refillBag = (random: RandomState): PieceKind[] => {
	const bag = [...PIECE_KINDS];
	for (let index = bag.length - 1; index > 0; index -= 1) {
		const swapIndex = nextRandomIndex(random, index + 1);
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
