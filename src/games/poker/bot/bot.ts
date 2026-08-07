import type { ComputerDifficulty } from '../../../shared/types';
import { evaluateHand } from '../domain/evaluator';
import type { Card, PokerPlayerState, PokerStage } from '../types';
import { HandRank } from '../types';

export interface BotDecision {
	readonly action: 'button_a' | 'button_b' | 'button_x' | 'button_y';
	readonly raiseAmount?: number | undefined;
}

export function decideBotAction(
	player: PokerPlayerState,
	stage: PokerStage,
	highestBet: number,
	minRaise: number,
	pot: number,
	communityCards: readonly Card[],
	difficulty: ComputerDifficulty,
	seedVal: number,
): BotDecision {
	const callCost = highestBet - player.currentBet;
	const canCheck = callCost === 0;

	// If player is already all in or folded, no action needed
	if (player.folded || player.isAllIn) {
		return { action: 'button_a' };
	}

	// Calculate hand strength score (0..100)
	let strength = 0;

	if (stage === 'preflop') {
		const c1 = player.holeCards[0];
		const c2 = player.holeCards[1];
		if (c1 && c2) {
			const high = Math.max(c1.rank, c2.rank);
			const low = Math.min(c1.rank, c2.rank);
			const isPair = c1.rank === c2.rank;
			const isSuited = c1.suit === c2.suit;

			if (isPair) {
				strength = 50 + high * 3; // 56 (2s) to 92 (Aces)
			} else {
				strength = high * 3 + low * 2 + (isSuited ? 10 : 0);
				if (high >= 13 && low >= 10) strength += 15;
			}
		}
	} else if (communityCards.length >= 3 && player.holeCards.length === 2) {
		const evalRes = evaluateHand([...player.holeCards, ...communityCards]);
		switch (evalRes.rank) {
			case HandRank.RoyalFlush:
			case HandRank.StraightFlush:
			case HandRank.FourOfAKind:
				strength = 98;
				break;
			case HandRank.FullHouse:
				strength = 90;
				break;
			case HandRank.Flush:
				strength = 82;
				break;
			case HandRank.Straight:
				strength = 75;
				break;
			case HandRank.ThreeOfAKind:
				strength = 65;
				break;
			case HandRank.TwoPair:
				strength = 55;
				break;
			case HandRank.OnePair:
				strength = 40 + (evalRes.bestFive[0]?.rank ?? 0);
				break;
			case HandRank.HighCard:
			default:
				strength = 15 + (evalRes.bestFive[0]?.rank ?? 0);
				break;
		}
	}

	// Adjust based on difficulty
	const roll = (seedVal % 100) / 100;

	if (difficulty === 'beginner') {
		// Passive, checks when possible, calls small bets, folds to big raises
		if (canCheck) return { action: 'button_a' };
		if (callCost <= player.chips * 0.2 || strength > 45) {
			return { action: 'button_a' };
		}
		return { action: 'button_b' };
	}

	if (difficulty === 'challenger') {
		if (strength >= 70 && player.chips > minRaise) {
			// Raise
			const raiseTo = Math.min(
				player.chips + player.currentBet,
				highestBet + Math.max(minRaise, Math.floor(pot * 0.5)),
			);
			return { action: 'button_x', raiseAmount: raiseTo };
		}
		if (strength >= 35 || canCheck || callCost <= player.chips * 0.3) {
			return { action: 'button_a' };
		}
		return { action: 'button_b' };
	}

	// Legendary AI
	if (strength >= 80) {
		// All in or Big Raise
		if (roll > 0.6 || player.chips <= minRaise * 2) {
			return { action: 'button_y' };
		}
		const raiseTo = Math.min(
			player.chips + player.currentBet,
			highestBet + Math.max(minRaise, Math.floor(pot * 0.75)),
		);
		return { action: 'button_x', raiseAmount: raiseTo };
	}

	if (strength >= 45 || canCheck) {
		if (!canCheck && callCost > player.chips * 0.6 && strength < 55) {
			return { action: 'button_b' };
		}
		return { action: 'button_a' };
	}

	// Occasional bluff check/call
	if (roll < 0.25 && callCost <= player.chips * 0.15) {
		return { action: 'button_a' };
	}

	return canCheck ? { action: 'button_a' } : { action: 'button_b' };
}
