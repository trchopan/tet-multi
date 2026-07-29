export interface RandomState {
	state: number;
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

export const nextRandomIndex = (
	random: RandomState,
	exclusiveMaximum: number,
): number => {
	if (!Number.isInteger(exclusiveMaximum) || exclusiveMaximum <= 0)
		throw new RangeError('exclusiveMaximum must be a positive integer');
	return nextIndex(random, exclusiveMaximum);
};
