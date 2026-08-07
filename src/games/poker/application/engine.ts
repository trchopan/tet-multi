import type {
	GameEngine,
	PlayerGameSummary,
	PlayerInputEnvelope,
} from '../../types';
import type { ComputerDifficulty } from '../../../shared/types';
import { decideBotAction } from '../bot/bot';
import { evaluateHand } from '../domain/evaluator';
import type {
	Card,
	PokerGameState,
	PokerPlayerState,
	PokerStage,
	Rank,
	SidePot,
	Suit,
} from '../types';

function createSeededPRNG(seedStr: string) {
	let h = 2166136261 >>> 0;
	for (let i = 0; i < seedStr.length; i++) {
		h = Math.imul(h ^ seedStr.charCodeAt(i), 16777619);
	}
	return function next(): number {
		h += 0x6d2b79f5;
		let t = Math.imul(h ^ (h >>> 15), 1 | h);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const MAX_TURN_TIME_TICKS = 900; // 15 seconds per turn at 60 Hz

function createDeck(): Card[] {
	const deck: Card[] = [];
	for (const suit of SUITS) {
		for (const rank of RANKS) {
			deck.push({ suit, rank });
		}
	}
	return deck;
}

export class PokerGameEngine implements GameEngine<
	PokerGameState,
	string,
	PokerGameState
> {
	private prng: () => number;

	private stage: PokerStage = 'idle';
	private handNumber = 0;
	private dealerSeatIndex = 0;
	private smallBlindSeatIndex = 0;
	private bigBlindSeatIndex = 0;
	private currentTurnSeatIndex = 0;
	private smallBlindAmount = 10;
	private bigBlindAmount = 20;
	private highestBet = 0;
	private minRaise = 20;
	private pot = 0;
	private sidePots: SidePot[] = [];
	private communityCards: Card[] = [];
	private fullDeck: Card[] = [];
	private players: PokerPlayerState[] = [];
	private winningPlayerIds: string[] = [];
	private winReason = '';
	private turnTimeRemainingTicks = MAX_TURN_TIME_TICKS;
	private botDelayTicks = 0;
	private stageEndDelayTicks = 0;
	private actionLog: string[] = [];

	private setCurrentTurnSeat(seatIndex: number): void {
		this.currentTurnSeatIndex = seatIndex;
		this.turnTimeRemainingTicks = MAX_TURN_TIME_TICKS;
		const currentP = this.players[seatIndex];
		if (currentP?.isComputer) {
			this.botDelayTicks = 60 + Math.floor(this.prng() * 60);
		} else {
			this.botDelayTicks = 0;
		}
	}

	private logAction(message: string): void {
		this.actionLog.push(message);
		if (this.actionLog.length > 25) {
			this.actionLog.shift();
		}
	}

	private playerPlacements = new Map<string, number>();
	private playerEliminatedTicks = new Map<string, number>();

	constructor(
		_matchId: string,
		seed: string,
		initialPlayers: readonly {
			playerId: string;
			displayName: string;
			playerType?: 'human' | 'computer' | undefined;
			computerDifficulty?: ComputerDifficulty | undefined;
		}[],
		startingChips = 1000,
	) {
		this.prng = createSeededPRNG(seed);

		this.players = initialPlayers.map((p) => ({
			playerId: p.playerId,
			displayName: p.displayName,
			chips: startingChips,
			currentBet: 0,
			totalBetInHand: 0,
			folded: false,
			isAllIn: false,
			holeCards: [],
			pendingBet: this.bigBlindAmount,
			isComputer: p.playerType === 'computer',
			computerDifficulty: p.computerDifficulty,
		}));

		this.startNextHand();
	}

	private shuffleDeck(): Card[] {
		const deck = createDeck();
		for (let i = deck.length - 1; i > 0; i--) {
			const j = Math.floor(this.prng() * (i + 1));
			const temp = deck[i]!;
			deck[i] = deck[j]!;
			deck[j] = temp;
		}
		return deck;
	}

	private checkMatchEnd(): boolean {
		const active = this.players.filter((p) => p.chips > 0);
		const activeHumans = active.filter((p) => !p.isComputer);
		const hasHumans = this.players.some((p) => !p.isComputer);

		if (active.length <= 1) {
			this.winningPlayerIds = active.map((p) => p.playerId);
			this.winReason = 'Match completed! Single player remaining.';
			return true;
		}
		if (hasHumans && activeHumans.length === 0) {
			const topChips = Math.max(...active.map((p) => p.chips), 0);
			const winners = active.filter((p) => p.chips === topChips);
			this.winningPlayerIds = winners.map((p) => p.playerId);
			this.winReason = 'Match completed! All human players eliminated.';
			return true;
		}
		return false;
	}

	private startNextHand(): void {
		if (this.checkMatchEnd()) {
			this.stage = 'hand_ended';
			return;
		}

		const active = this.players.filter((p) => p.chips > 0);

		this.handNumber += 1;
		this.fullDeck = this.shuffleDeck();
		this.communityCards = [];
		this.pot = 0;
		this.sidePots = [];
		this.winningPlayerIds = [];
		this.winReason = '';
		this.stageEndDelayTicks = 0;
		this.logAction(`Hand #${this.handNumber} started`);

		// Move dealer button to next player with chips

		if (this.handNumber > 1) {
			let nextDealer = (this.dealerSeatIndex + 1) % this.players.length;
			while (this.players[nextDealer]!.chips <= 0) {
				nextDealer = (nextDealer + 1) % this.players.length;
			}
			this.dealerSeatIndex = nextDealer;
		} else {
			this.dealerSeatIndex = 0;
		}

		// Calculate SB and BB seats
		const count = this.players.length;
		if (active.length === 2) {
			// Heads up: Dealer is SB, other is BB
			this.smallBlindSeatIndex = this.dealerSeatIndex;
			let bb = (this.dealerSeatIndex + 1) % count;
			while (this.players[bb]!.chips <= 0) bb = (bb + 1) % count;
			this.bigBlindSeatIndex = bb;
		} else {
			let sb = (this.dealerSeatIndex + 1) % count;
			while (this.players[sb]!.chips <= 0) sb = (sb + 1) % count;
			this.smallBlindSeatIndex = sb;

			let bb = (sb + 1) % count;
			while (this.players[bb]!.chips <= 0) bb = (bb + 1) % count;
			this.bigBlindSeatIndex = bb;
		}

		// Reset per-hand player state
		this.players = this.players.map((p) => {
			if (p.chips <= 0) {
				return {
					...p,
					currentBet: 0,
					totalBetInHand: 0,
					folded: true,
					isAllIn: false,
					holeCards: [],
					pendingBet: 0,
				};
			}
			return {
				...p,
				currentBet: 0,
				totalBetInHand: 0,
				folded: false,
				isAllIn: false,
				holeCards: [],
				pendingBet: this.bigBlindAmount,
				lastAction: undefined,
				handResult: undefined,
			};
		});

		// Deal 2 hole cards per active player
		let cardIdx = 0;
		for (let i = 0; i < 2; i++) {
			for (let seat = 0; seat < count; seat++) {
				const player = this.players[seat]!;
				if (!player.folded) {
					const card = this.fullDeck[cardIdx++]!;
					this.players[seat] = {
						...this.players[seat]!,
						holeCards: [...this.players[seat]!.holeCards, card],
					};
				}
			}
		}

		// Post Blinds
		this.postBlind(this.smallBlindSeatIndex, this.smallBlindAmount, 'SB');
		this.postBlind(this.bigBlindSeatIndex, this.bigBlindAmount, 'BB');

		this.highestBet = this.bigBlindAmount;
		this.minRaise = this.bigBlindAmount;
		this.stage = 'preflop';

		// Action starts left of Big Blind (or SB in heads up)
		let firstTurn = (this.bigBlindSeatIndex + 1) % count;
		while (
			this.players[firstTurn]!.folded ||
			this.players[firstTurn]!.isAllIn ||
			this.players[firstTurn]!.chips <= 0
		) {
			firstTurn = (firstTurn + 1) % count;
		}
		this.setCurrentTurnSeat(firstTurn);
	}

	private postBlind(seatIndex: number, amount: number, label: string): void {
		const p = this.players[seatIndex]!;
		const actual = Math.min(p.chips, amount);
		const newChips = p.chips - actual;
		const isAllIn = newChips === 0;

		this.players[seatIndex] = {
			...p,
			chips: newChips,
			currentBet: actual,
			totalBetInHand: actual,
			isAllIn,
			lastAction: `${label} ${actual}`,
		};
		this.pot += actual;
		this.logAction(`${p.displayName} posted ${label} $${actual}`);
	}

	tick(
		serverTick: number,
		inputs: readonly PlayerInputEnvelope<string>[],
	): void {
		if (this.isFinished()) return;

		// If waiting between hands
		if (this.stage === 'hand_ended') {
			this.stageEndDelayTicks += 1;
			if (this.stageEndDelayTicks >= 180) {
				this.startNextHand();
			}
			return;
		}

		// Check if only 1 player remains non-folded
		const nonFolded = this.players.filter((p) => !p.folded);
		if (nonFolded.length === 1) {
			this.awardPotToSoleSurvivor(nonFolded[0]!, serverTick);
			return;
		}

		const currentP = this.players[this.currentTurnSeatIndex]!;

		// Process inputs for current turn player
		let acted = false;

		for (const env of inputs) {
			if (env.playerId !== currentP.playerId) continue;

			// Handle bet slider inputs
			if (env.action === 'up') {
				const step = this.bigBlindAmount;
				const maxBet = currentP.chips + currentP.currentBet;
				const nextBet = Math.min(maxBet, currentP.pendingBet + step);
				this.players[this.currentTurnSeatIndex] = {
					...currentP,
					pendingBet: nextBet,
				};
				continue;
			}
			if (env.action === 'down') {
				const step = this.bigBlindAmount;
				const minB = Math.max(
					this.highestBet + this.minRaise,
					currentP.currentBet,
				);
				const nextBet = Math.max(minB, currentP.pendingBet - step);
				this.players[this.currentTurnSeatIndex] = {
					...currentP,
					pendingBet: nextBet,
				};
				continue;
			}
			if (env.action === 'right') {
				const doubleB = currentP.pendingBet * 2;
				const maxBet = currentP.chips + currentP.currentBet;
				this.players[this.currentTurnSeatIndex] = {
					...currentP,
					pendingBet: Math.min(maxBet, doubleB),
				};
				continue;
			}
			if (env.action === 'left') {
				const minB = Math.max(
					this.highestBet + this.minRaise,
					this.bigBlindAmount,
				);
				this.players[this.currentTurnSeatIndex] = {
					...currentP,
					pendingBet: Math.min(currentP.chips + currentP.currentBet, minB),
				};
				continue;
			}

			// Handle action buttons
			if (env.action === 'button_a') {
				// Check or Call
				const callCost = this.highestBet - currentP.currentBet;
				if (callCost === 0) {
					this.executePlayerAction(this.currentTurnSeatIndex, 'check');
				} else {
					this.executePlayerAction(this.currentTurnSeatIndex, 'call');
				}
				acted = true;
				break;
			}
			if (env.action === 'button_b') {
				// Fold
				this.executePlayerAction(this.currentTurnSeatIndex, 'fold');
				acted = true;
				break;
			}
			if (env.action === 'button_x') {
				// Raise
				this.executePlayerAction(
					this.currentTurnSeatIndex,
					'raise',
					currentP.pendingBet,
				);
				acted = true;
				break;
			}
			if (env.action === 'button_y') {
				// All In
				this.executePlayerAction(this.currentTurnSeatIndex, 'all_in');
				acted = true;
				break;
			}
		}

		// Decrement turn timer on active turn
		this.turnTimeRemainingTicks -= 1;

		// Handle Computer AI action or timeout auto-action
		if (!acted) {
			if (currentP.isComputer) {
				this.botDelayTicks -= 1;
				if (this.botDelayTicks <= 0 || this.turnTimeRemainingTicks <= 0) {
					const botDecision = decideBotAction(
						currentP,
						this.stage,
						this.highestBet,
						this.minRaise,
						this.pot,
						this.communityCards,
						currentP.computerDifficulty ?? 'legendary',
						serverTick + this.currentTurnSeatIndex * 13,
					);

					if (botDecision.action === 'button_b') {
						this.executePlayerAction(this.currentTurnSeatIndex, 'fold');
					} else if (botDecision.action === 'button_y') {
						this.executePlayerAction(this.currentTurnSeatIndex, 'all_in');
					} else if (botDecision.action === 'button_x') {
						const raiseAmt =
							botDecision.raiseAmount ?? this.highestBet + this.minRaise;
						this.executePlayerAction(
							this.currentTurnSeatIndex,
							'raise',
							raiseAmt,
						);
					} else {
						const callCost = this.highestBet - currentP.currentBet;
						this.executePlayerAction(
							this.currentTurnSeatIndex,
							callCost === 0 ? 'check' : 'call',
						);
					}
					acted = true;
				}
			} else {
				if (this.turnTimeRemainingTicks <= 0) {
					// Auto fold or check on timeout
					const callCost = this.highestBet - currentP.currentBet;
					this.executePlayerAction(
						this.currentTurnSeatIndex,
						callCost === 0 ? 'check' : 'fold',
					);
					acted = true;
				}
			}
		}
	}

	private executePlayerAction(
		seatIndex: number,
		action: 'fold' | 'check' | 'call' | 'raise' | 'all_in',
		targetBet = 0,
	): void {
		const p = this.players[seatIndex]!;
		if (p.folded || p.isAllIn) return;

		let effectiveAction = action;
		if (effectiveAction === 'check' && this.highestBet > p.currentBet) {
			effectiveAction = 'call';
		}

		let newP = { ...p };

		if (effectiveAction === 'fold') {
			newP = { ...newP, folded: true, lastAction: 'FOLD' };
			this.logAction(`${p.displayName} folded`);
		} else if (effectiveAction === 'check') {
			newP = { ...newP, lastAction: 'CHECK' };
			this.logAction(`${p.displayName} checked`);
		} else if (effectiveAction === 'call') {
			const callCost = this.highestBet - p.currentBet;
			const actualCost = Math.min(p.chips, callCost);
			const newChips = p.chips - actualCost;
			const isAllIn = newChips === 0;
			this.pot += actualCost;
			newP = {
				...newP,
				chips: newChips,
				currentBet: p.currentBet + actualCost,
				totalBetInHand: p.totalBetInHand + actualCost,
				isAllIn,
				lastAction: isAllIn ? 'ALL-IN' : `CALL ${actualCost}`,
			};
			this.logAction(
				`${p.displayName} ${isAllIn ? 'went ALL-IN' : `called $${actualCost}`}`,
			);
		} else if (action === 'all_in') {
			const allInAmt = p.chips;
			const newCurrentBet = p.currentBet + allInAmt;
			if (newCurrentBet > this.highestBet) {
				const raiseAmt = newCurrentBet - this.highestBet;
				if (raiseAmt >= this.minRaise) this.minRaise = raiseAmt;
				this.highestBet = newCurrentBet;
			}
			this.pot += allInAmt;
			newP = {
				...newP,
				chips: 0,
				currentBet: newCurrentBet,
				totalBetInHand: p.totalBetInHand + allInAmt,
				isAllIn: true,
				lastAction: 'ALL-IN',
			};
			this.logAction(`${p.displayName} went ALL-IN ($${allInAmt})`);
		} else if (action === 'raise') {
			const desiredCurrentBet = Math.max(
				this.highestBet + this.minRaise,
				targetBet,
			);
			const addAmount = Math.min(p.chips, desiredCurrentBet - p.currentBet);
			const finalCurrentBet = p.currentBet + addAmount;
			const raiseDiff = finalCurrentBet - this.highestBet;

			if (raiseDiff > 0 && raiseDiff >= this.minRaise) {
				this.minRaise = raiseDiff;
			}
			if (finalCurrentBet > this.highestBet) {
				this.highestBet = finalCurrentBet;
			}

			const newChips = p.chips - addAmount;
			const isAllIn = newChips === 0;
			this.pot += addAmount;

			newP = {
				...newP,
				chips: newChips,
				currentBet: finalCurrentBet,
				totalBetInHand: p.totalBetInHand + addAmount,
				isAllIn,
				lastAction: isAllIn ? 'ALL-IN' : `RAISE to ${finalCurrentBet}`,
			};
			this.logAction(
				`${p.displayName} ${isAllIn ? 'went ALL-IN' : `raised to $${finalCurrentBet}`}`,
			);
		}

		newP = { ...newP, hasActedThisRound: true };
		this.players[seatIndex] = newP;
		this.advanceTurnOrStage();
	}

	private advanceTurnOrStage(): void {
		const nonFolded = this.players.filter((p) => !p.folded);
		if (nonFolded.length === 1) {
			this.awardPotToSoleSurvivor(nonFolded[0]!, 0);
			return;
		}

		const nonFoldedNonAllIn = this.players.filter(
			(p) => !p.folded && !p.isAllIn && p.chips > 0,
		);

		// Check if current betting round is completed
		const roundComplete = this.players.every(
			(p) =>
				p.folded ||
				p.isAllIn ||
				(p.hasActedThisRound && p.currentBet === this.highestBet),
		);

		if (roundComplete) {
			if (nonFoldedNonAllIn.length <= 1) {
				this.fastForwardToShowdown();
			} else {
				this.advanceStage();
			}
			return;
		}

		// Find next eligible turn seat
		let nextSeat = (this.currentTurnSeatIndex + 1) % this.players.length;
		let loops = 0;
		while (
			(this.players[nextSeat]!.folded ||
				this.players[nextSeat]!.isAllIn ||
				this.players[nextSeat]!.chips <= 0) &&
			loops < this.players.length
		) {
			nextSeat = (nextSeat + 1) % this.players.length;
			loops++;
		}
		this.setCurrentTurnSeat(nextSeat);
	}

	private advanceStage(): void {
		// Reset current bets and hasActedThisRound for next stage
		this.players = this.players.map((p) => ({
			...p,
			currentBet: 0,
			hasActedThisRound: false,
			pendingBet: this.bigBlindAmount,
		}));
		this.highestBet = 0;
		this.minRaise = this.bigBlindAmount;

		if (this.stage === 'preflop') {
			this.stage = 'flop';
			// Deal Flop (3 cards)
			this.communityCards = [
				this.fullDeck[15]!,
				this.fullDeck[16]!,
				this.fullDeck[17]!,
			];
			this.logAction('Flop dealt');
		} else if (this.stage === 'flop') {
			this.stage = 'turn';
			// Deal Turn (1 card)
			this.communityCards.push(this.fullDeck[18]!);
			this.logAction('Turn dealt');
		} else if (this.stage === 'turn') {
			this.stage = 'river';
			// Deal River (1 card)
			this.communityCards.push(this.fullDeck[19]!);
			this.logAction('River dealt');
		} else if (this.stage === 'river') {
			this.resolveShowdown();
			return;
		}

		// Set turn to seat after dealer
		let firstTurn = (this.dealerSeatIndex + 1) % this.players.length;
		while (
			this.players[firstTurn]!.folded ||
			this.players[firstTurn]!.isAllIn ||
			this.players[firstTurn]!.chips <= 0
		) {
			firstTurn = (firstTurn + 1) % this.players.length;
		}
		this.setCurrentTurnSeat(firstTurn);
	}

	private fastForwardToShowdown(): void {
		// Ensure 5 community cards are present
		if (this.communityCards.length < 3) {
			this.communityCards.push(
				this.fullDeck[15]!,
				this.fullDeck[16]!,
				this.fullDeck[17]!,
			);
		}
		if (this.communityCards.length < 4) {
			this.communityCards.push(this.fullDeck[18]!);
		}
		if (this.communityCards.length < 5) {
			this.communityCards.push(this.fullDeck[19]!);
		}

		this.resolveShowdown();
	}

	private resolveShowdown(): void {
		this.stage = 'showdown';
		const contenders = this.players.filter((p) => !p.folded);

		if (contenders.length === 0) {
			this.stage = 'hand_ended';
			this.stageEndDelayTicks = 0;
			return;
		}

		// Evaluate hands for contenders
		const evaluated = contenders.map((p) => ({
			player: p,
			evalRes: evaluateHand([...p.holeCards, ...this.communityCards]),
		}));

		// Sort by hand evaluation value descending
		evaluated.sort((a, b) => b.evalRes.value - a.evalRes.value);

		const topValue = evaluated[0]!.evalRes.value;
		const winners = evaluated.filter((e) => e.evalRes.value === topValue);
		this.winningPlayerIds = winners.map((w) => w.player.playerId);
		this.winReason = winners[0]!.evalRes.label;
		this.logAction(
			`Showdown: ${winners.map((w) => w.player.displayName).join(', ')} won $${this.pot} (${this.winReason})`,
		);

		// Calculate chip payout per winner
		const share = Math.floor(this.pot / winners.length);
		const remainder = this.pot % winners.length;

		this.players = this.players.map((p) => {
			const isWinner = winners.some((w) => w.player.playerId === p.playerId);
			if (isWinner) {
				const wonAmount =
					share + (winners[0]!.player.playerId === p.playerId ? remainder : 0);
				const evalInfo = evaluated.find(
					(e) => e.player.playerId === p.playerId,
				);
				return {
					...p,
					chips: p.chips + wonAmount,
					handResult: `WON ${wonAmount} (${evalInfo?.evalRes.label})`,
				};
			}
			if (!p.folded) {
				const evalInfo = evaluated.find(
					(e) => e.player.playerId === p.playerId,
				);
				return {
					...p,
					handResult: evalInfo?.evalRes.label ?? 'Lost',
				};
			}
			return {
				...p,
				handResult: 'Folded',
			};
		});

		this.checkBustedPlayers();
		this.stage = 'hand_ended';
		this.stageEndDelayTicks = 0;
		this.checkMatchEnd();
	}

	private awardPotToSoleSurvivor(
		survivor: PokerPlayerState,
		tick: number,
	): void {
		this.winningPlayerIds = [survivor.playerId];
		this.winReason = `${survivor.displayName} won (Everyone else folded)`;
		this.logAction(
			`${survivor.displayName} won $${this.pot} (Everyone else folded)`,
		);

		this.players = this.players.map((p) => {
			if (p.playerId === survivor.playerId) {
				return {
					...p,
					chips: p.chips + this.pot,
					handResult: `WON ${this.pot} (Uncontested)`,
				};
			}
			return {
				...p,
				handResult: 'Folded',
			};
		});

		this.checkBustedPlayers(tick);
		this.stage = 'hand_ended';
		this.stageEndDelayTicks = 0;
		this.checkMatchEnd();
	}

	private checkBustedPlayers(tick = 0): void {
		const remaining = this.players.filter((p) => p.chips > 0);
		for (const p of this.players) {
			if (p.chips <= 0 && !this.playerPlacements.has(p.playerId)) {
				this.playerPlacements.set(p.playerId, remaining.length + 1);
				this.playerEliminatedTicks.set(p.playerId, tick);
			}
		}
	}

	getPublicSnapshot(): PokerGameState {
		// Mask hole cards of other players unless stage is showdown or hand_ended
		const showAllCards =
			this.stage === 'showdown' || this.stage === 'hand_ended';

		const maskedPlayers = this.players.map((p) => ({
			...p,
			holeCards: showAllCards
				? p.holeCards
				: p.holeCards.map(() => ({
						suit: 'spades' as const,
						rank: 2 as const,
						hidden: true,
					})),
		}));

		return {
			stage: this.stage,
			handNumber: this.handNumber,
			dealerSeatIndex: this.dealerSeatIndex,
			smallBlindSeatIndex: this.smallBlindSeatIndex,
			bigBlindSeatIndex: this.bigBlindSeatIndex,
			currentTurnSeatIndex: this.currentTurnSeatIndex,
			smallBlindAmount: this.smallBlindAmount,
			bigBlindAmount: this.bigBlindAmount,
			highestBet: this.highestBet,
			minRaise: this.minRaise,
			pot: this.pot,
			sidePots: this.sidePots,
			communityCards: this.communityCards,
			players: maskedPlayers,
			winningPlayerIds: this.winningPlayerIds,
			winReason: this.winReason,
			turnTimeRemainingTicks: this.turnTimeRemainingTicks,
			maxTurnTimeTicks: MAX_TURN_TIME_TICKS,
			actionLog: this.actionLog.slice(-8),
		};
	}

	getPrivateSnapshot(playerId: string): PokerGameState {
		const showAllCards =
			this.stage === 'showdown' || this.stage === 'hand_ended';

		const maskedPlayers = this.players.map((p) => {
			const isSelf = p.playerId === playerId;
			return {
				...p,
				holeCards:
					isSelf || showAllCards
						? p.holeCards
						: p.holeCards.map(() => ({
								suit: 'spades' as const,
								rank: 2 as const,
								hidden: true,
							})),
			};
		});

		return {
			stage: this.stage,
			handNumber: this.handNumber,
			dealerSeatIndex: this.dealerSeatIndex,
			smallBlindSeatIndex: this.smallBlindSeatIndex,
			bigBlindSeatIndex: this.bigBlindSeatIndex,
			currentTurnSeatIndex: this.currentTurnSeatIndex,
			smallBlindAmount: this.smallBlindAmount,
			bigBlindAmount: this.bigBlindAmount,
			highestBet: this.highestBet,
			minRaise: this.minRaise,
			pot: this.pot,
			sidePots: this.sidePots,
			communityCards: this.communityCards,
			players: maskedPlayers,
			winningPlayerIds: this.winningPlayerIds,
			winReason: this.winReason,
			turnTimeRemainingTicks: this.turnTimeRemainingTicks,
			maxTurnTimeTicks: MAX_TURN_TIME_TICKS,
			actionLog: this.actionLog.slice(-8),
		};
	}

	getPlayerSummaries(): Map<string, PlayerGameSummary> {
		const summaries = new Map<string, PlayerGameSummary>();
		const totalPlayers = this.players.length;

		for (const p of this.players) {
			const isBusted = p.chips <= 0 && this.stage === 'hand_ended';
			const matchState = isBusted ? 'eliminated' : 'playing';

			summaries.set(p.playerId, {
				playerId: p.playerId,
				matchState,
				score: p.chips,
				placement:
					this.playerPlacements.get(p.playerId) ??
					(isBusted ? totalPlayers : 1),
				eliminatedAtTick: this.playerEliminatedTicks.get(p.playerId),
			});
		}
		return summaries;
	}

	isFinished(): boolean {
		const active = this.players.filter((p) => p.chips > 0);
		const activeHumans = active.filter((p) => !p.isComputer);
		const hasHumans = this.players.some((p) => !p.isComputer);

		const isEnded =
			active.length <= 1 || (hasHumans && activeHumans.length === 0);
		return isEnded && this.stage === 'hand_ended';
	}

	getWinners(): string[] {
		const active = this.players.filter((p) => p.chips > 0);
		if (active.length === 1) return [active[0]!.playerId];
		if (this.winningPlayerIds.length > 0) return this.winningPlayerIds;
		const topChips = Math.max(...active.map((p) => p.chips), 0);
		return active.filter((p) => p.chips === topChips).map((p) => p.playerId);
	}

	getHash(): string {
		const cardStr = this.communityCards
			.map((c) => `${c.rank}${c.suit[0]}`)
			.join(',');
		const pStr = this.players
			.map((p) => `${p.playerId}:${p.chips}:${p.folded ? 1 : 0}`)
			.join('|');
		return `${this.stage}:${this.handNumber}:${this.pot}:${cardStr}:${pStr}`;
	}

	eliminatePlayers(playerIds: readonly string[]): void {
		for (const id of playerIds) {
			const idx = this.players.findIndex((p) => p.playerId === id);
			if (idx !== -1) {
				const p = this.players[idx]!;
				this.players[idx] = {
					...p,
					folded: true,
					chips: 0,
					lastAction: 'LEFT',
				};
			}
		}
	}
}
