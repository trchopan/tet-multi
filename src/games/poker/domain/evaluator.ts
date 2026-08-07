import type { Card, HandEvaluation, Rank } from '$/games/poker/types';
import { HandRank } from '$/games/poker/types';

const RANK_NAMES: Record<Rank, string> = {
	14: 'Ace',
	13: 'King',
	12: 'Queen',
	11: 'Jack',
	10: '10',
	9: '9',
	8: '8',
	7: '7',
	6: '6',
	5: '5',
	4: '4',
	3: '3',
	2: '2',
};

const PLURAL_RANK_NAMES: Record<Rank, string> = {
	14: 'Aces',
	13: 'Kings',
	12: 'Queens',
	11: 'Jacks',
	10: 'Tens',
	9: 'Nines',
	8: 'Eights',
	7: 'Sevens',
	6: 'Sixes',
	5: 'Fives',
	4: 'Fours',
	3: 'Threes',
	2: 'Twos',
};

/** Compute base-15 score for lexicographical tiebreaking of 5 ordered rank values */
function computeScore(handRank: HandRank, ranks: readonly number[]): number {
	let score = handRank * Math.pow(15, 5);
	for (let i = 0; i < 5; i++) {
		const r = ranks[i] ?? 0;
		score += r * Math.pow(15, 4 - i);
	}
	return score;
}

/** Generate all combinations of 5 cards out of a given list of cards (e.g., 7 cards) */
function combinations5(cards: readonly Card[]): Card[][] {
	const result: Card[][] = [];
	const n = cards.length;
	if (n < 5) return result;

	for (let i = 0; i < n - 4; i++) {
		for (let j = i + 1; j < n - 3; j++) {
			for (let k = j + 1; k < n - 2; k++) {
				for (let l = k + 1; l < n - 1; l++) {
					for (let m = l + 1; m < n; m++) {
						result.push([
							cards[i]!,
							cards[j]!,
							cards[k]!,
							cards[l]!,
							cards[m]!,
						]);
					}
				}
			}
		}
	}
	return result;
}

/** Evaluate exactly 5 cards */
export function evaluate5Cards(cards: readonly Card[]): HandEvaluation {
	if (cards.length !== 5) {
		throw new Error('evaluate5Cards expects exactly 5 cards');
	}

	// Sort cards descending by rank
	const sorted = [...cards].sort((a, b) => b.rank - a.rank);
	const isFlush = sorted.every((c) => c.suit === sorted[0]!.suit);

	// Check Straight
	let isStraight = false;
	let straightHighRank = 0;

	if (
		sorted[0]!.rank - sorted[4]!.rank === 4 &&
		new Set(sorted.map((c) => c.rank)).size === 5
	) {
		isStraight = true;
		straightHighRank = sorted[0]!.rank;
	} else if (
		sorted[0]!.rank === 14 &&
		sorted[1]!.rank === 5 &&
		sorted[2]!.rank === 4 &&
		sorted[3]!.rank === 3 &&
		sorted[4]!.rank === 2
	) {
		// Ace-low straight A-2-3-4-5
		isStraight = true;
		straightHighRank = 5;
	}

	// Group by rank frequency
	const counts = new Map<Rank, number>();
	for (const card of sorted) {
		counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
	}

	const freq = Array.from(counts.entries()).sort((a, b) => {
		if (b[1] !== a[1]) return b[1] - a[1];
		return b[0] - a[0];
	});

	// 1. Royal Flush / Straight Flush
	if (isFlush && isStraight) {
		if (straightHighRank === 14) {
			return {
				rank: HandRank.RoyalFlush,
				label: `Royal Flush of ${sorted[0]!.suit}`,
				value: computeScore(HandRank.RoyalFlush, [14, 13, 12, 11, 10]),
				bestFive: sorted,
			};
		}
		const straightCards =
			straightHighRank === 5
				? [sorted[1]!, sorted[2]!, sorted[3]!, sorted[4]!, sorted[0]!]
				: sorted;
		return {
			rank: HandRank.StraightFlush,
			label: `Straight Flush, ${RANK_NAMES[straightHighRank as Rank]} High`,
			value: computeScore(HandRank.StraightFlush, [
				straightHighRank,
				straightHighRank - 1,
				straightHighRank - 2,
				straightHighRank - 3,
				straightHighRank - 4,
			]),
			bestFive: straightCards,
		};
	}

	// 2. Four of a Kind
	if (freq[0]![1] === 4) {
		const fourRank = freq[0]![0];
		const kickerRank = freq[1]![0];
		const bestFive = [
			...sorted.filter((c) => c.rank === fourRank),
			...sorted.filter((c) => c.rank === kickerRank),
		];
		return {
			rank: HandRank.FourOfAKind,
			label: `Four of a Kind, ${PLURAL_RANK_NAMES[fourRank]}`,
			value: computeScore(HandRank.FourOfAKind, [
				fourRank,
				fourRank,
				fourRank,
				fourRank,
				kickerRank,
			]),
			bestFive,
		};
	}

	// 3. Full House
	if (freq[0]![1] === 3 && freq[1]![1] === 2) {
		const tripsRank = freq[0]![0];
		const pairRank = freq[1]![0];
		const bestFive = [
			...sorted.filter((c) => c.rank === tripsRank),
			...sorted.filter((c) => c.rank === pairRank),
		];
		return {
			rank: HandRank.FullHouse,
			label: `Full House, ${PLURAL_RANK_NAMES[tripsRank]} full of ${PLURAL_RANK_NAMES[pairRank]}`,
			value: computeScore(HandRank.FullHouse, [
				tripsRank,
				tripsRank,
				tripsRank,
				pairRank,
				pairRank,
			]),
			bestFive,
		};
	}

	// 4. Flush
	if (isFlush) {
		const ranks = sorted.map((c) => c.rank);
		return {
			rank: HandRank.Flush,
			label: `Flush, ${RANK_NAMES[sorted[0]!.rank]} High`,
			value: computeScore(HandRank.Flush, ranks),
			bestFive: sorted,
		};
	}

	// 5. Straight
	if (isStraight) {
		const straightCards =
			straightHighRank === 5
				? [sorted[1]!, sorted[2]!, sorted[3]!, sorted[4]!, sorted[0]!]
				: sorted;
		return {
			rank: HandRank.Straight,
			label: `Straight, ${RANK_NAMES[straightHighRank as Rank]} High`,
			value: computeScore(HandRank.Straight, [
				straightHighRank,
				straightHighRank - 1,
				straightHighRank - 2,
				straightHighRank - 3,
				straightHighRank - 4,
			]),
			bestFive: straightCards,
		};
	}

	// 6. Three of a Kind
	if (freq[0]![1] === 3) {
		const tripsRank = freq[0]![0];
		const k1 = freq[1]![0];
		const k2 = freq[2]![0];
		const bestFive = [
			...sorted.filter((c) => c.rank === tripsRank),
			...sorted.filter((c) => c.rank === k1),
			...sorted.filter((c) => c.rank === k2),
		];
		return {
			rank: HandRank.ThreeOfAKind,
			label: `Three of a Kind, ${PLURAL_RANK_NAMES[tripsRank]}`,
			value: computeScore(HandRank.ThreeOfAKind, [
				tripsRank,
				tripsRank,
				tripsRank,
				k1,
				k2,
			]),
			bestFive,
		};
	}

	// 7. Two Pair
	if (freq[0]![1] === 2 && freq[1]![1] === 2) {
		const highPair = Math.max(freq[0]![0], freq[1]![0]) as Rank;
		const lowPair = Math.min(freq[0]![0], freq[1]![0]) as Rank;
		const kicker = freq[2]![0];
		const bestFive = [
			...sorted.filter((c) => c.rank === highPair),
			...sorted.filter((c) => c.rank === lowPair),
			...sorted.filter((c) => c.rank === kicker),
		];
		return {
			rank: HandRank.TwoPair,
			label: `Two Pair, ${PLURAL_RANK_NAMES[highPair]} and ${PLURAL_RANK_NAMES[lowPair]}`,
			value: computeScore(HandRank.TwoPair, [
				highPair,
				highPair,
				lowPair,
				lowPair,
				kicker,
			]),
			bestFive,
		};
	}

	// 8. One Pair
	if (freq[0]![1] === 2) {
		const pairRank = freq[0]![0];
		const k1 = freq[1]![0];
		const k2 = freq[2]![0];
		const k3 = freq[3]![0];
		const bestFive = [
			...sorted.filter((c) => c.rank === pairRank),
			...sorted.filter((c) => c.rank === k1),
			...sorted.filter((c) => c.rank === k2),
			...sorted.filter((c) => c.rank === k3),
		];
		return {
			rank: HandRank.OnePair,
			label: `Pair of ${PLURAL_RANK_NAMES[pairRank]}`,
			value: computeScore(HandRank.OnePair, [pairRank, pairRank, k1, k2, k3]),
			bestFive,
		};
	}

	// 9. High Card
	const ranks = sorted.map((c) => c.rank);
	return {
		rank: HandRank.HighCard,
		label: `High Card, ${RANK_NAMES[sorted[0]!.rank]}`,
		value: computeScore(HandRank.HighCard, ranks),
		bestFive: sorted,
	};
}

/** Evaluate best 5-card hand out of 5 to 7 cards (hole cards + community cards) */
export function evaluateHand(cards: readonly Card[]): HandEvaluation {
	if (cards.length < 5) {
		throw new Error('evaluateHand requires at least 5 cards');
	}
	if (cards.length === 5) {
		return evaluate5Cards(cards);
	}

	const combos = combinations5(cards);
	let bestEval: HandEvaluation | undefined;

	for (const combo of combos) {
		const currentEval = evaluate5Cards(combo);
		if (bestEval === undefined || currentEval.value > bestEval.value) {
			bestEval = currentEval;
		}
	}

	return bestEval!;
}
