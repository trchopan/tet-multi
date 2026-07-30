import { describe, expect, it } from 'bun:test';
import { PokerGameEngine } from '../poker/engine';

describe('PokerGameEngine', () => {
	it('initializes match, posts blinds, and deals 2 hole cards per player', () => {
		const engine = new PokerGameEngine('match-1', 'seed-123', [
			{ playerId: 'p1', displayName: 'Alice' },
			{ playerId: 'p2', displayName: 'Bob' },
			{ playerId: 'p3', displayName: 'Charlie' },
		]);

		const state = engine.getPublicSnapshot();
		expect(state.handNumber).toBe(1);
		expect(state.stage).toBe('preflop');
		expect(state.pot).toBe(30); // 10 SB + 20 BB
		expect(state.communityCards.length).toBe(0);

		// Check player cards masked in public snapshot
		const p1Public = state.players.find((p) => p.playerId === 'p1')!;
		expect(p1Public.holeCards.length).toBe(2);
		expect(p1Public.holeCards[0]!.hidden).toBe(true);

		// Check private snapshot unmasks for p1
		const p1Private = engine
			.getPrivateSnapshot('p1')
			.players.find((p) => p.playerId === 'p1')!;
		expect(p1Private.holeCards[0]!.hidden).toBeUndefined();
		expect(p1Private.holeCards[0]!.suit).toBeDefined();
		expect(p1Private.holeCards[0]!.rank).toBeDefined();

		// Check p2 is masked in p1's private snapshot
		const p2Private = engine
			.getPrivateSnapshot('p1')
			.players.find((p) => p.playerId === 'p2')!;
		expect(p2Private.holeCards[0]!.hidden).toBe(true);
	});

	it('processes player actions and advances stages deterministically', () => {
		const engine = new PokerGameEngine('match-2', 'test-seed', [
			{ playerId: 'p1', displayName: 'Alice' },
			{ playerId: 'p2', displayName: 'Bob' },
		]);

		// Preflop: Heads up dealer is p1 (SB: 10), p2 is BB (20).
		// Action starts at p1 (SB).
		let state = engine.getPublicSnapshot();
		expect(state.highestBet).toBe(20);

		// p1 Calls (button_a) to match 20
		engine.tick(1, [{ playerId: 'p1', sequence: 1, action: 'button_a' }]);
		state = engine.getPublicSnapshot();
		expect(state.pot).toBe(40); // 20 + 20

		// p2 Checks (button_a) to complete preflop
		engine.tick(2, [{ playerId: 'p2', sequence: 1, action: 'button_a' }]);
		state = engine.getPublicSnapshot();
		expect(state.stage).toBe('flop');
		expect(state.communityCards.length).toBe(3);
	});

	it('handles fold to award uncontested pot to survivor', () => {
		const engine = new PokerGameEngine('match-3', 'test-seed-fold', [
			{ playerId: 'p1', displayName: 'Alice' },
			{ playerId: 'p2', displayName: 'Bob' },
		]);

		// p1 folds
		engine.tick(1, [{ playerId: 'p1', sequence: 1, action: 'button_b' }]);
		const state = engine.getPublicSnapshot();
		expect(state.winningPlayerIds).toEqual(['p2']);
		expect(state.winReason).toContain('folded');
	});

	it('simulates automated bot actions on tick', () => {
		const engine = new PokerGameEngine('match-4', 'bot-seed', [
			{ playerId: 'human', displayName: 'Alice' },
			{
				playerId: 'cpu1',
				displayName: 'CPU 1',
				playerType: 'computer',
				computerDifficulty: 'legendary',
			},
		]);

		// Human checks/calls
		engine.tick(1, [{ playerId: 'human', sequence: 1, action: 'button_a' }]);
		// Tick past bot thinking delay (60-120 ticks)
		for (let i = 0; i < 150; i++) {
			engine.tick(i + 2, []);
		}
		const state = engine.getPublicSnapshot();
		expect(state.stage).toBeDefined();
	});

	it('generates consistent deterministic state hash', () => {
		const engine1 = new PokerGameEngine('m-1', 'same-seed', [
			{ playerId: 'p1', displayName: 'Alice' },
			{ playerId: 'p2', displayName: 'Bob' },
		]);

		const engine2 = new PokerGameEngine('m-1', 'same-seed', [
			{ playerId: 'p1', displayName: 'Alice' },
			{ playerId: 'p2', displayName: 'Bob' },
		]);

		expect(engine1.getHash()).toBe(engine2.getHash());
	});

	it('records actionLog events and exports maxTurnTimeTicks metadata', () => {
		const engine = new PokerGameEngine('match-5', 'log-seed', [
			{ playerId: 'p1', displayName: 'Alice' },
			{ playerId: 'p2', displayName: 'Bob' },
		]);

		let state = engine.getPublicSnapshot();
		expect(state.maxTurnTimeTicks).toBe(900);
		expect(state.actionLog).toBeDefined();
		expect(state.actionLog!.length).toBeGreaterThan(0);

		// Verify blind posting and hand start logged
		expect(
			state.actionLog!.some((log) => log.includes('Hand #1 started')),
		).toBe(true);
		expect(state.actionLog!.some((log) => log.includes('posted SB'))).toBe(
			true,
		);

		// p1 Calls
		engine.tick(1, [{ playerId: 'p1', sequence: 1, action: 'button_a' }]);
		state = engine.getPublicSnapshot();
		expect(state.actionLog!.some((log) => log.includes('called'))).toBe(true);
	});

	it('safely converts check to call when player is facing a bet', () => {
		const engine = new PokerGameEngine('match-6', 'check-test', [
			{ playerId: 'p1', displayName: 'Alice' },
			{ playerId: 'p2', displayName: 'Bob' },
		]);

		// Preflop: p1 is SB (bet 10), highestBet is 20 (p2 BB).
		// p1 attempts to check without matching highestBet.
		// Engine should auto-convert check to call (chip count down to 980, currentBet 20).
		engine.tick(1, [{ playerId: 'p1', sequence: 1, action: 'button_a' }]);
		const state = engine.getPublicSnapshot();
		const p1 = state.players.find((p) => p.playerId === 'p1')!;
		expect(p1.currentBet).toBe(20);
		expect(p1.chips).toBe(980);
	});

	it('ends match when all human players have lost all money (0 chips)', () => {
		const engine = new PokerGameEngine(
			'match-7',
			'human-elim-seed',
			[
				{ playerId: 'human1', displayName: 'Alice' },
				{
					playerId: 'cpu1',
					displayName: 'CPU 1',
					playerType: 'computer',
					computerDifficulty: 'legendary',
				},
				{
					playerId: 'cpu2',
					displayName: 'CPU 2',
					playerType: 'computer',
					computerDifficulty: 'legendary',
				},
			],
			50, // 50 starting chips so CPUs retain chips when human is eliminated
		);

		// human1 goes All-In (button_y) on tick 1 (chips = 0)
		engine.tick(1, [{ playerId: 'human1', sequence: 1, action: 'button_y' }]);

		// Tick through all bot decision delays, betting rounds (preflop, flop, turn, river), showdown, and hand_ended delay
		for (let i = 2; i <= 1200; i++) {
			engine.tick(i, []);
		}

		expect(engine.isFinished()).toBe(true);
		const state = engine.getPublicSnapshot();
		expect(state.winReason).toMatch(/Match completed!/);
		expect(engine.getWinners().length).toBeGreaterThan(0);
	});
});
