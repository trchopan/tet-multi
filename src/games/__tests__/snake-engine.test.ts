import { describe, expect, test } from 'bun:test';
import { SnakeGameEngine } from '../snake/engine';

describe('Snake Arena Engine', () => {
	const players = [
		{ playerId: 'player-1', displayName: 'Alice' },
		{ playerId: 'player-2', displayName: 'Bob' },
	];

	test('initializes 2-player snake game with food and distinct start positions', () => {
		const engine = new SnakeGameEngine('match-1', 'seed-123', players);
		const snapshot = engine.getPublicSnapshot();

		expect(snapshot.gridWidth).toBe(40);
		expect(snapshot.gridHeight).toBe(30);
		expect(snapshot.food.length).toBeGreaterThan(0);

		expect(snapshot.snakes['player-1']).toBeDefined();
		expect(snapshot.snakes['player-2']).toBeDefined();
		expect(snapshot.snakes['player-1']!.body.length).toBe(4);
	});

	test('advances snake movement deterministically', () => {
		const engine = new SnakeGameEngine('match-1', 'seed-123', players);
		const initialHead = engine.getPublicSnapshot().snakes['player-1']!.body[0]!;

		// Tick 4 times (MOVE_EVERY_N_TICKS = 4)
		for (let i = 1; i <= 4; i++) {
			engine.tick(i, []);
		}

		const newHead = engine.getPublicSnapshot().snakes['player-1']!.body[0]!;
		expect(newHead.x).toBe(initialHead.x + 1); // Default direction is right
	});

	test('eliminates player on wall collision', () => {
		const engine = new SnakeGameEngine('match-1', 'seed-123', players);

		// Drive player-1 into wall (player-1 starts at x=5, y=5 facing right)
		// Turn up, then tick 10 times to hit top wall (y=0 -> y=-1)
		engine.tick(0, [{ playerId: 'player-1', sequence: 1, action: 'up' }]);

		for (let tick = 1; tick <= 30; tick++) {
			engine.tick(tick, []);
		}

		const p1 = engine.getPlayerSummaries().get('player-1')!;
		expect(p1.matchState).toBe('eliminated');
	});

	test('produces stable state hash for determinism check', () => {
		const engine1 = new SnakeGameEngine('match-1', 'seed-xyz', players);
		const engine2 = new SnakeGameEngine('match-1', 'seed-xyz', players);

		expect(engine1.getHash()).toBe(engine2.getHash());
	});
});
