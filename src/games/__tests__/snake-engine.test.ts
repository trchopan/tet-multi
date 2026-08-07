import { describe, expect, test } from 'bun:test';
import { SnakeGameEngine, getSnakeSize } from '../snake';

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
		expect(snapshot.snakes['player-1']!.levels).toEqual([1, 1, 1, 1]);
	});

	test('advances snake movement deterministically', () => {
		const engine = new SnakeGameEngine('match-1', 'seed-123', players);
		const initialHead = engine.getPublicSnapshot().snakes['player-1']!.body[0]!;

		// Tick 16 times (MOVE_EVERY_N_TICKS = 16)
		for (let i = 1; i <= 16; i++) {
			engine.tick(i, []);
		}

		const newHead = engine.getPublicSnapshot().snakes['player-1']!.body[0]!;
		expect(newHead.x).toBe(initialHead.x + 1); // Default direction is right
	});

	test('bounces starting player (size 4) off wall with segment shedding penalty', () => {
		const engine = new SnakeGameEngine('match-1', 'seed-123', players);

		// Drive player-1 into top wall (player-1 starts at x=5, y=5 facing right with size 4)
		engine.tick(0, [{ playerId: 'player-1', sequence: 1, action: 'up' }]);

		// Tick 6 * 16 = 96 server ticks to move 6 steps up from y=5 to y=-1 (hitting wall)
		for (let tick = 1; tick <= 96; tick++) {
			engine.tick(tick, []);
		}

		const p1State = (engine as any).players.get('player-1');
		expect(p1State.matchState).toBe('playing');
		expect(p1State.direction).toBe('down'); // Flipped from up to down!
		expect(p1State.body.length).toBe(3); // Size reduced from 4 to 3!
	});

	test('eliminates player on wall collision when size is <= 1', () => {
		const engine = new SnakeGameEngine('match-1', 'seed-elim-1', players);
		const p1 = (engine as any).players.get('player-1');

		// Set player-1 to size 1 at top wall facing up: head at (5, 0)
		p1.body = [{ x: 5, y: 0 }];
		p1.levels = [1];
		p1.direction = 'up';
		p1.nextDirection = 'up';

		// Step physics (16 ticks)
		for (let i = 1; i <= 16; i++) {
			engine.tick(i, []);
		}

		const summaryP1 = engine.getPlayerSummaries().get('player-1')!;
		expect(summaryP1.matchState).toBe('eliminated');
	});

	test('bounces large snake (size > 4) off wall with segment shedding penalty', () => {
		const engine = new SnakeGameEngine('match-1', 'seed-wall-bounce', players);
		const p1 = (engine as any).players.get('player-1');

		// Create size 6 snake near top wall facing up: head at (5, 0), moving up to (5, -1)
		p1.body = [
			{ x: 5, y: 0 },
			{ x: 5, y: 1 },
			{ x: 5, y: 2 },
			{ x: 5, y: 3 },
			{ x: 5, y: 4 },
			{ x: 5, y: 5 },
		];
		p1.levels = [1, 1, 1, 1, 1, 1];
		p1.direction = 'up';
		p1.nextDirection = 'up';

		// Step physics (16 ticks)
		for (let i = 1; i <= 16; i++) {
			engine.tick(i, []);
		}

		// Player-1 should NOT be eliminated; it bounced!
		expect(p1.matchState).toBe('playing');
		expect(p1.direction).toBe('down'); // Direction reversed from 'up' to 'down'
		expect(p1.body.length).toBe(5); // Shed 1 segment penalty (6 -> 5)
		expect(p1.body[0]).toEqual({ x: 5, y: 4 }); // Tail (5, 5) was shed, so (5, 4) is the new head!

		// Food dropped at impact point (5, 0)
		const snapshot = engine.getPublicSnapshot();
		expect(snapshot.food.some((f) => f.x === 5 && f.y === 0)).toBe(true);
	});

	test('eliminates snake when corner-trapped with no valid rebound position', () => {
		const engine = new SnakeGameEngine('match-1', 'seed-trap', players);
		const p1 = (engine as any).players.get('player-1');

		// Player-1 (size 6) head at (0, 0) moving left to (-1, 0) [Wall Hit!]
		// Tail is at (0, 5), but we place Player-2 body at (0, 5) to block the rebound!
		p1.body = [
			{ x: 0, y: 0 },
			{ x: 0, y: 1 },
			{ x: 0, y: 2 },
			{ x: 0, y: 3 },
			{ x: 0, y: 4 },
			{ x: 0, y: 5 },
		];
		p1.levels = [1, 1, 1, 1, 1, 1];
		p1.direction = 'left';
		p1.nextDirection = 'left';

		const p2 = (engine as any).players.get('player-2');
		p2.body = [
			{ x: 0, y: 5 }, // Blocking player-1 tail position!
			{ x: 1, y: 5 },
			{ x: 2, y: 5 },
			{ x: 3, y: 5 },
		];
		p2.levels = [1, 1, 1, 1];

		// Step physics
		for (let i = 1; i <= 16; i++) {
			engine.tick(i, []);
		}

		// Player-1 rebound was blocked -> eliminated!
		const summaryP1 = engine.getPlayerSummaries().get('player-1')!;
		expect(summaryP1.matchState).toBe('eliminated');
	});

	test('neck biting kills smaller snake and converts 100% of body into food', () => {
		const engine = new SnakeGameEngine('match-1', 'seed-neck', players);
		// Manually manipulate player states for a controlled test scenario
		const p1 = (engine as any).players.get('player-1');
		const p2 = (engine as any).players.get('player-2');

		// Make player-1 larger (length 5) at x=5, y=5 facing right
		p1.body = [
			{ x: 5, y: 5 },
			{ x: 4, y: 5 },
			{ x: 3, y: 5 },
			{ x: 2, y: 5 },
			{ x: 1, y: 5 },
		];
		p1.levels = [1, 1, 1, 1, 1];

		// Place player-2 (length 4, size 4) so its neck (last 3 segments) is at (6, 5)
		// Player-2 body: head at (6, 8), (6, 7), (6, 6), tail at (6, 5)
		p2.body = [
			{ x: 6, y: 8 },
			{ x: 6, y: 7 },
			{ x: 6, y: 6 },
			{ x: 6, y: 5 }, // tail is neck!
		];
		p2.levels = [1, 1, 1, 1];
		p2.direction = 'up';
		p2.nextDirection = 'up';

		// Tick 16 times to advance physics
		for (let i = 1; i <= 16; i++) {
			engine.tick(i, []);
		}

		// Player-1 size 5 > Player-2 size 4, and Player-1 head stepped into (6, 5) which is Player-2 neck!
		const summaryP2 = engine.getPlayerSummaries().get('player-2')!;
		expect(summaryP2.matchState).toBe('eliminated');

		const summaryP1 = engine.getPlayerSummaries().get('player-1')!;
		expect(summaryP1.matchState).toBe('playing');
		expect(summaryP1.score).toBeGreaterThanOrEqual(300);
	});

	test('triggers bounce reject effect when smaller snake hits larger snake body', () => {
		const engine = new SnakeGameEngine('match-1', 'seed-bounce', players);
		const p1 = (engine as any).players.get('player-1');
		const p2 = (engine as any).players.get('player-2');

		// Player-1 (smaller, size 4) head at (5, 5) facing right -> next head (6, 5)
		p1.body = [
			{ x: 5, y: 5 },
			{ x: 4, y: 5 },
			{ x: 3, y: 5 },
			{ x: 2, y: 5 },
		];
		p1.levels = [1, 1, 1, 1];
		p1.direction = 'right';
		p1.nextDirection = 'right';

		// Player-2 (larger, size 6) body occupies (6, 5) at non-neck segment
		p2.body = [
			{ x: 6, y: 4 },
			{ x: 6, y: 5 },
			{ x: 6, y: 6 },
			{ x: 6, y: 7 },
			{ x: 6, y: 8 },
			{ x: 6, y: 9 },
		];
		p2.levels = [1, 1, 1, 1, 1, 1];
		p2.direction = 'down';
		p2.nextDirection = 'down';

		// Step physics
		for (let i = 1; i <= 16; i++) {
			engine.tick(i, []);
		}

		// Player-1 is NOT eliminated! Player-1 bounced!
		expect(p1.matchState).toBe('playing');
		expect(p1.direction).toBe('left'); // Reversed direction from 'right' to 'left'!
		expect(p1.body[0]).toEqual({ x: 2, y: 5 }); // Body was reversed!
	});

	test('caps max snake length at 20 and evolves segment levels on eating food', () => {
		const engine = new SnakeGameEngine('match-1', 'seed-evolve', players);
		const p1 = (engine as any).players.get('player-1');

		// Create length 20 snake
		const body20 = [];
		for (let i = 0; i < 20; i++) {
			body20.push({ x: 25 - i, y: 5 });
		}
		p1.body = body20;
		p1.levels = Array(20).fill(1);
		p1.direction = 'right';
		p1.nextDirection = 'right';

		// Place food right in front of head at (26, 5)
		(engine as any).food = [{ x: 26, y: 5 }];

		// Tick physics
		for (let i = 1; i <= 16; i++) {
			engine.tick(i, []);
		}

		// Length remains 20 (capped!)
		expect(p1.body.length).toBe(20);
		expect(p1.body[0]).toEqual({ x: 26, y: 5 });

		// First segment level evolved to 2!
		expect(p1.levels[0]).toBe(2);
		expect(getSnakeSize(p1)).toBe(21);
	});

	test('produces stable state hash for determinism check', () => {
		const engine1 = new SnakeGameEngine('match-1', 'seed-xyz', players);
		const engine2 = new SnakeGameEngine('match-1', 'seed-xyz', players);

		expect(engine1.getHash()).toBe(engine2.getHash());
	});

	test('finishes match when all human players are eliminated even with multiple bots remaining', () => {
		const roster = [
			{
				playerId: 'human-1',
				displayName: 'Human',
				playerType: 'human' as const,
			},
			{
				playerId: 'bot-1',
				displayName: 'CPU 1',
				playerType: 'computer' as const,
			},
			{
				playerId: 'bot-2',
				displayName: 'CPU 2',
				playerType: 'computer' as const,
			},
		];

		const engine = new SnakeGameEngine('match-human-elim', 'seed-test', roster);
		expect(engine.isFinished()).toBe(false);

		// Eliminate the human player
		engine.eliminatePlayers(['human-1']);

		// The match should immediately be finished because no active human players remain
		expect(engine.isFinished()).toBe(true);
		expect(engine.getWinners().sort()).toEqual(['bot-1', 'bot-2']);
	});

	test('continues match while at least one human player is active in a multi-human match with bots', () => {
		const roster = [
			{
				playerId: 'human-1',
				displayName: 'Human 1',
				playerType: 'human' as const,
			},
			{
				playerId: 'human-2',
				displayName: 'Human 2',
				playerType: 'human' as const,
			},
			{
				playerId: 'bot-1',
				displayName: 'CPU 1',
				playerType: 'computer' as const,
			},
		];

		const engine = new SnakeGameEngine(
			'match-multi-human',
			'seed-test-2',
			roster,
		);
		expect(engine.isFinished()).toBe(false);

		// Eliminate only one human player
		engine.eliminatePlayers(['human-1']);

		// The match should NOT finish yet because human-2 is still active
		expect(engine.isFinished()).toBe(false);

		// Eliminate second human player
		engine.eliminatePlayers(['human-2']);

		// Now the match should finish
		expect(engine.isFinished()).toBe(true);
		expect(engine.getWinners()).toEqual(['bot-1']);
	});
});
