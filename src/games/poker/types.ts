import type { ComputerDifficulty } from '$/shared/types';

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
	readonly suit: Suit;
	readonly rank: Rank;
	readonly hidden?: boolean;
}

export enum HandRank {
	HighCard = 1,
	OnePair = 2,
	TwoPair = 3,
	ThreeOfAKind = 4,
	Straight = 5,
	Flush = 6,
	FullHouse = 7,
	FourOfAKind = 8,
	StraightFlush = 9,
	RoyalFlush = 10,
}

export interface HandEvaluation {
	readonly rank: HandRank;
	readonly label: string;
	readonly value: number;
	readonly bestFive: readonly Card[];
}

export type PokerStage =
	'idle' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'hand_ended';

export interface PokerPlayerState {
	readonly playerId: string;
	readonly displayName: string;
	readonly chips: number;
	readonly currentBet: number;
	readonly totalBetInHand: number;
	readonly folded: boolean;
	readonly isAllIn: boolean;
	readonly holeCards: readonly Card[];
	readonly pendingBet: number;
	readonly hasActedThisRound?: boolean | undefined;
	readonly lastAction?: string | undefined;
	readonly handResult?: string | undefined;
	readonly isComputer?: boolean | undefined;
	readonly computerDifficulty?: ComputerDifficulty | undefined;
}

export interface SidePot {
	readonly amount: number;
	readonly eligiblePlayerIds: readonly string[];
}

export interface PokerGameState {
	readonly stage: PokerStage;
	readonly handNumber: number;
	readonly dealerSeatIndex: number;
	readonly smallBlindSeatIndex: number;
	readonly bigBlindSeatIndex: number;
	readonly currentTurnSeatIndex: number;
	readonly smallBlindAmount: number;
	readonly bigBlindAmount: number;
	readonly highestBet: number;
	readonly minRaise: number;
	readonly pot: number;
	readonly sidePots: readonly SidePot[];
	readonly communityCards: readonly Card[];
	readonly players: readonly PokerPlayerState[];
	readonly winningPlayerIds: readonly string[];
	readonly winReason: string;
	readonly turnTimeRemainingTicks: number;
	readonly maxTurnTimeTicks?: number;
	readonly actionLog?: readonly string[];
}
