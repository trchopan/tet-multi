import { describe, expect, it } from 'bun:test';
import { evaluate5Cards, evaluateHand } from '../poker/evaluator';
import { HandRank, type Card } from '../poker/types';

describe('Poker Hand Evaluator', () => {
	it('evaluates High Card', () => {
		const cards: Card[] = [
			{ suit: 'spades', rank: 14 },
			{ suit: 'hearts', rank: 10 },
			{ suit: 'diamonds', rank: 8 },
			{ suit: 'clubs', rank: 5 },
			{ suit: 'spades', rank: 2 },
		];
		const res = evaluate5Cards(cards);
		expect(res.rank).toBe(HandRank.HighCard);
		expect(res.label).toContain('High Card, Ace');
	});

	it('evaluates One Pair', () => {
		const cards: Card[] = [
			{ suit: 'spades', rank: 14 },
			{ suit: 'hearts', rank: 14 },
			{ suit: 'diamonds', rank: 8 },
			{ suit: 'clubs', rank: 5 },
			{ suit: 'spades', rank: 2 },
		];
		const res = evaluate5Cards(cards);
		expect(res.rank).toBe(HandRank.OnePair);
		expect(res.label).toContain('Pair of Aces');
	});

	it('evaluates Two Pair', () => {
		const cards: Card[] = [
			{ suit: 'spades', rank: 14 },
			{ suit: 'hearts', rank: 14 },
			{ suit: 'diamonds', rank: 8 },
			{ suit: 'clubs', rank: 8 },
			{ suit: 'spades', rank: 2 },
		];
		const res = evaluate5Cards(cards);
		expect(res.rank).toBe(HandRank.TwoPair);
		expect(res.label).toContain('Two Pair, Aces and Eights');
	});

	it('evaluates Three of a Kind', () => {
		const cards: Card[] = [
			{ suit: 'spades', rank: 7 },
			{ suit: 'hearts', rank: 7 },
			{ suit: 'diamonds', rank: 7 },
			{ suit: 'clubs', rank: 10 },
			{ suit: 'spades', rank: 2 },
		];
		const res = evaluate5Cards(cards);
		expect(res.rank).toBe(HandRank.ThreeOfAKind);
		expect(res.label).toContain('Three of a Kind, Sevens');
	});

	it('evaluates Straight with Ace High', () => {
		const cards: Card[] = [
			{ suit: 'spades', rank: 14 },
			{ suit: 'hearts', rank: 13 },
			{ suit: 'diamonds', rank: 12 },
			{ suit: 'clubs', rank: 11 },
			{ suit: 'spades', rank: 10 },
		];
		const res = evaluate5Cards(cards);
		expect(res.rank).toBe(HandRank.Straight);
		expect(res.label).toContain('Straight, Ace High');
	});

	it('evaluates Ace-Low Straight (Wheel 5-4-3-2-A)', () => {
		const cards: Card[] = [
			{ suit: 'spades', rank: 14 },
			{ suit: 'hearts', rank: 5 },
			{ suit: 'diamonds', rank: 4 },
			{ suit: 'clubs', rank: 3 },
			{ suit: 'spades', rank: 2 },
		];
		const res = evaluate5Cards(cards);
		expect(res.rank).toBe(HandRank.Straight);
		expect(res.label).toContain('Straight, 5 High');
	});

	it('evaluates Flush', () => {
		const cards: Card[] = [
			{ suit: 'hearts', rank: 14 },
			{ suit: 'hearts', rank: 10 },
			{ suit: 'hearts', rank: 8 },
			{ suit: 'hearts', rank: 5 },
			{ suit: 'hearts', rank: 3 },
		];
		const res = evaluate5Cards(cards);
		expect(res.rank).toBe(HandRank.Flush);
		expect(res.label).toContain('Flush, Ace High');
	});

	it('evaluates Full House', () => {
		const cards: Card[] = [
			{ suit: 'spades', rank: 10 },
			{ suit: 'hearts', rank: 10 },
			{ suit: 'diamonds', rank: 10 },
			{ suit: 'clubs', rank: 4 },
			{ suit: 'spades', rank: 4 },
		];
		const res = evaluate5Cards(cards);
		expect(res.rank).toBe(HandRank.FullHouse);
		expect(res.label).toContain('Full House, Tens full of Fours');
	});

	it('evaluates Four of a Kind', () => {
		const cards: Card[] = [
			{ suit: 'spades', rank: 9 },
			{ suit: 'hearts', rank: 9 },
			{ suit: 'diamonds', rank: 9 },
			{ suit: 'clubs', rank: 9 },
			{ suit: 'spades', rank: 14 },
		];
		const res = evaluate5Cards(cards);
		expect(res.rank).toBe(HandRank.FourOfAKind);
		expect(res.label).toContain('Four of a Kind, Nines');
	});

	it('evaluates Straight Flush & Royal Flush', () => {
		const royal: Card[] = [
			{ suit: 'diamonds', rank: 14 },
			{ suit: 'diamonds', rank: 13 },
			{ suit: 'diamonds', rank: 12 },
			{ suit: 'diamonds', rank: 11 },
			{ suit: 'diamonds', rank: 10 },
		];
		const resRoyal = evaluate5Cards(royal);
		expect(resRoyal.rank).toBe(HandRank.RoyalFlush);

		const sf: Card[] = [
			{ suit: 'clubs', rank: 9 },
			{ suit: 'clubs', rank: 8 },
			{ suit: 'clubs', rank: 7 },
			{ suit: 'clubs', rank: 6 },
			{ suit: 'clubs', rank: 5 },
		];
		const resSf = evaluate5Cards(sf);
		expect(resSf.rank).toBe(HandRank.StraightFlush);
	});

	it('evaluates best 5-card hand from 7 cards', () => {
		const cards7: Card[] = [
			{ suit: 'spades', rank: 14 },
			{ suit: 'hearts', rank: 14 },
			{ suit: 'diamonds', rank: 14 },
			{ suit: 'clubs', rank: 8 },
			{ suit: 'spades', rank: 8 },
			{ suit: 'hearts', rank: 2 },
			{ suit: 'clubs', rank: 3 },
		];
		const res = evaluateHand(cards7);
		expect(res.rank).toBe(HandRank.FullHouse);
		expect(res.label).toBe('Full House, Aces full of Eights');
	});

	it('correctly orders higher hand values for tiebreaking', () => {
		const fullHouseAces = evaluate5Cards([
			{ suit: 'spades', rank: 14 },
			{ suit: 'hearts', rank: 14 },
			{ suit: 'diamonds', rank: 14 },
			{ suit: 'clubs', rank: 2 },
			{ suit: 'spades', rank: 2 },
		]);
		const fullHouseKings = evaluate5Cards([
			{ suit: 'spades', rank: 13 },
			{ suit: 'hearts', rank: 13 },
			{ suit: 'diamonds', rank: 13 },
			{ suit: 'clubs', rank: 14 },
			{ suit: 'spades', rank: 14 },
		]);
		expect(fullHouseAces.value).toBeGreaterThan(fullHouseKings.value);
	});
});
