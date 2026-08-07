import { describe, expect, test } from 'bun:test';
import { SnakeGameEngine } from '$/games/snake';
import {
	createSnakeBotController,
	nextSnakeBotAction,
} from '$/games/snake/bot/bot';
import type { EngineInitPlayer } from '$/games/types';
import type { SnakeGameState } from '$/games/snake/types';

describe('Snake Computer Player Bot', () => {
	const playersWithComputer: EngineInitPlayer[] = [
		{ playerId: 'human-1', displayName: 'Human', playerType: 'human' },
		{
			playerId: 'bot-1',
			displayName: 'Bot Challenger',
			playerType: 'computer',
			computerDifficulty: 'challenger',
		},
		{
			playerId: 'bot-2',
			displayName: 'Bot Legendary',
			playerType: 'computer',
			computerDifficulty: 'legendary',
		},
	];

	test('initializes botControllers for computer players in engine', () => {
		const engine = new SnakeGameEngine(
			'match-1',
			'seed-bot-init',
			playersWithComputer,
		);

		expect(engine.botControllers.size).toBe(2);
		expect(engine.botControllers.has('bot-1')).toBe(true);
		expect(engine.botControllers.has('bot-2')).toBe(true);
		expect(engine.botControllers.has('human-1')).toBe(false);
	});

	test('nextSnakeBotAction navigates towards food', () => {
		const controller = createSnakeBotController('test-seed', 0, 'legendary');
		const mockState: SnakeGameState = {
			gridWidth: 40,
			gridHeight: 30,
			food: [{ x: 10, y: 5 }],
			snakes: {
				'bot-1': {
					body: [
						{ x: 5, y: 5 },
						{ x: 4, y: 5 },
						{ x: 3, y: 5 },
						{ x: 2, y: 5 },
					],
					direction: 'right',
					score: 0,
					matchState: 'playing',
					colorIndex: 0,
				},
			},
		};

		const action = nextSnakeBotAction(controller, mockState, 'bot-1', 4);
		expect(action).toBe('right'); // Food is at x=10, y=5, snake is at x=5, y=5 moving right
	});

	test('bot steers away from walls to avoid elimination', () => {
		const engine = new SnakeGameEngine(
			'match-1',
			'seed-wall-dodge',
			playersWithComputer,
		);

		// Run engine for 100 ticks (25 physics moves)
		for (let tick = 1; tick <= 100; tick++) {
			engine.tick(tick, []);
		}

		const summaries = engine.getPlayerSummaries();
		const bot1 = summaries.get('bot-1')!;
		const bot2 = summaries.get('bot-2')!;

		expect(bot1.matchState).toBe('playing');
		expect(bot2.matchState).toBe('playing');
	});

	test('bot deterministically seeks food and scores points', () => {
		const engine = new SnakeGameEngine(
			'match-1',
			'seed-food-seek',
			playersWithComputer,
		);

		// Advance 200 ticks
		for (let tick = 1; tick <= 200; tick++) {
			engine.tick(tick, []);
		}

		const bot2 = engine.getPlayerSummaries().get('bot-2')!;
		expect(bot2.score).toBeGreaterThan(0);
	});

	test('identical seed and roster produce identical bot choices and engine hash', () => {
		const engineA = new SnakeGameEngine(
			'match-1',
			'seed-repro',
			playersWithComputer,
		);
		const engineB = new SnakeGameEngine(
			'match-1',
			'seed-repro',
			playersWithComputer,
		);

		for (let tick = 1; tick <= 120; tick++) {
			engineA.tick(tick, []);
			engineB.tick(tick, []);
		}

		expect(engineA.getHash()).toBe(engineB.getHash());
	});

	test('supports beginner, challenger, and legendary difficulty levels', () => {
		const difficulties: Array<'beginner' | 'challenger' | 'legendary'> = [
			'beginner',
			'challenger',
			'legendary',
		];

		for (const difficulty of difficulties) {
			const roster: EngineInitPlayer[] = [
				{
					playerId: `bot-${difficulty}`,
					displayName: `Bot ${difficulty}`,
					playerType: 'computer',
					computerDifficulty: difficulty,
				},
				{ playerId: 'p2', displayName: 'P2', playerType: 'human' },
			];

			const engine = new SnakeGameEngine(
				'match-diff',
				`seed-${difficulty}`,
				roster,
			);
			expect(engine.botControllers.size).toBe(1);

			for (let tick = 1; tick <= 40; tick++) {
				engine.tick(tick, []);
			}

			const botState = engine.getPlayerSummaries().get(`bot-${difficulty}`)!;
			expect(botState.matchState).toBe('playing');
		}
	});
});
