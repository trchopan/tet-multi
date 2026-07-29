import type {
	GameEngine,
	PlayerGameSummary,
	PlayerInputEnvelope,
} from '../types';
import type {
	Position,
	SnakeDirection,
	SnakeGameState,
	SnakeInputAction,
	SnakePlayerState,
} from './types';
import {
	createRandomState,
	nextRandom,
	type RandomState,
} from '../../game/random';

const GRID_WIDTH = 40;
const GRID_HEIGHT = 30;
const INITIAL_SNAKE_LENGTH = 4;
const FOOD_TARGET_COUNT = 8;
const MOVE_EVERY_N_TICKS = 4; // Advance snake physics every 4 server ticks

const STARTING_POSITIONS: { pos: Position; dir: SnakeDirection }[] = [
	{ pos: { x: 5, y: 5 }, dir: 'right' },
	{ pos: { x: 34, y: 24 }, dir: 'left' },
	{ pos: { x: 34, y: 5 }, dir: 'down' },
	{ pos: { x: 5, y: 24 }, dir: 'up' },
	{ pos: { x: 20, y: 15 }, dir: 'right' },
];

export class SnakeGameEngine implements GameEngine<
	SnakeGameState,
	SnakeInputAction
> {
	private readonly rng: RandomState;
	private readonly players = new Map<string, SnakePlayerState>();
	private food: Position[] = [];
	private isGameOver = false;
	private winners: string[] = [];

	constructor(
		_matchId: string,
		seed: string,
		roster: readonly { playerId: string; displayName: string }[],
	) {
		this.rng = createRandomState(seed, 0);

		for (let i = 0; i < roster.length; i++) {
			const p = roster[i]!;
			const start = STARTING_POSITIONS[i % STARTING_POSITIONS.length]!;
			const body: Position[] = [];
			for (let len = 0; len < INITIAL_SNAKE_LENGTH; len++) {
				if (start.dir === 'right')
					body.push({ x: start.pos.x - len, y: start.pos.y });
				else if (start.dir === 'left')
					body.push({ x: start.pos.x + len, y: start.pos.y });
				else if (start.dir === 'down')
					body.push({ x: start.pos.x, y: start.pos.y - len });
				else body.push({ x: start.pos.x, y: start.pos.y + len });
			}

			this.players.set(p.playerId, {
				playerId: p.playerId,
				displayName: p.displayName,
				body,
				direction: start.dir,
				nextDirection: start.dir,
				score: 0,
				matchState: 'playing',
				colorIndex: i,
			});
		}

		this.ensureFood();
	}

	tick(
		serverTick: number,
		inputs: readonly PlayerInputEnvelope<SnakeInputAction>[],
	): void {
		if (this.isGameOver) return;

		// 1. Process direction inputs
		for (const env of inputs) {
			const player = this.players.get(env.playerId);
			if (!player || player.matchState !== 'playing') continue;

			const action = env.action as string;
			const currDir = player.direction;

			if (action === 'up' && currDir !== 'down') player.nextDirection = 'up';
			else if (action === 'down' && currDir !== 'up')
				player.nextDirection = 'down';
			else if (action === 'left' && currDir !== 'right')
				player.nextDirection = 'left';
			else if (action === 'right' && currDir !== 'left')
				player.nextDirection = 'right';
		}

		// Only step physics every N ticks
		if (serverTick % MOVE_EVERY_N_TICKS !== 0) return;

		// Update active directions
		for (const player of this.players.values()) {
			if (player.matchState === 'playing') {
				player.direction = player.nextDirection;
			}
		}

		// 2. Compute new head positions
		const newHeads = new Map<string, Position>();
		for (const player of this.players.values()) {
			if (player.matchState !== 'playing') continue;
			const head = player.body[0]!;
			let nx = head.x;
			let ny = head.y;

			if (player.direction === 'up') ny -= 1;
			else if (player.direction === 'down') ny += 1;
			else if (player.direction === 'left') nx -= 1;
			else if (player.direction === 'right') nx += 1;

			newHeads.set(player.playerId, { x: nx, y: ny });
		}

		// 3. Collision Checks & Eliminations
		const eliminatedThisTick = new Set<string>();

		// A. Wall collisions & Self-collisions
		for (const [id, newHead] of newHeads) {
			const player = this.players.get(id)!;
			if (
				newHead.x < 0 ||
				newHead.x >= GRID_WIDTH ||
				newHead.y < 0 ||
				newHead.y >= GRID_HEIGHT
			) {
				eliminatedThisTick.add(id);
				continue;
			}
			// Self-collision (check body excluding tail if it will shrink, but easiest check all)
			for (let i = 0; i < player.body.length - 1; i++) {
				const seg = player.body[i]!;
				if (seg.x === newHead.x && seg.y === newHead.y) {
					eliminatedThisTick.add(id);
					break;
				}
			}
		}

		// B. Head vs Other Body collisions
		for (const [id, newHead] of newHeads) {
			if (eliminatedThisTick.has(id)) continue;

			for (const otherPlayer of this.players.values()) {
				if (otherPlayer.playerId === id || otherPlayer.matchState !== 'playing')
					continue;

				for (let i = 0; i < otherPlayer.body.length; i++) {
					const seg = otherPlayer.body[i]!;
					if (seg.x === newHead.x && seg.y === newHead.y) {
						eliminatedThisTick.add(id);
						break;
					}
				}
				if (eliminatedThisTick.has(id)) break;
			}
		}

		// C. Head vs Head collisions (Bigger snake eats smaller snake!)
		const activeHeadPairs = Array.from(newHeads.entries()).filter(
			([id]) => !eliminatedThisTick.has(id),
		);
		for (let i = 0; i < activeHeadPairs.length; i++) {
			for (let j = i + 1; j < activeHeadPairs.length; j++) {
				const [idA, posA] = activeHeadPairs[i]!;
				const [idB, posB] = activeHeadPairs[j]!;

				if (posA.x === posB.x && posA.y === posB.y) {
					const pA = this.players.get(idA)!;
					const pB = this.players.get(idB)!;

					if (pA.body.length > pB.body.length) {
						eliminatedThisTick.add(idB);
						pA.score += 300;
					} else if (pB.body.length > pA.body.length) {
						eliminatedThisTick.add(idA);
						pB.score += 300;
					} else {
						// Equal length -> both eliminated
						eliminatedThisTick.add(idA);
						eliminatedThisTick.add(idB);
					}
				}
			}
		}

		// Apply Eliminations
		if (eliminatedThisTick.size > 0) {
			const activeCount = Array.from(this.players.values()).filter(
				(p) => p.matchState === 'playing',
			).length;
			const placement = activeCount - eliminatedThisTick.size + 1;

			for (const id of eliminatedThisTick) {
				const player = this.players.get(id)!;
				player.matchState = 'eliminated';
				player.eliminatedAtTick = serverTick;
				player.placement = placement;

				// Spawn food from eliminated snake body!
				for (const seg of player.body) {
					if (nextRandom(this.rng) > 0.5) {
						this.food.push({ ...seg });
					}
				}
			}
		}

		// 4. Move surviving snakes & Check food eating
		for (const [id, newHead] of newHeads) {
			if (eliminatedThisTick.has(id)) continue;
			const player = this.players.get(id)!;

			// Check food collision
			const foodIndex = this.food.findIndex(
				(f) => f.x === newHead.x && f.y === newHead.y,
			);
			if (foodIndex !== -1) {
				// Eat food! Grow snake (do not pop tail)
				this.food.splice(foodIndex, 1);
				player.body.unshift(newHead);
				player.score += 100;
			} else {
				// Normal step
				player.body.unshift(newHead);
				player.body.pop();
			}
		}

		this.ensureFood();

		// 5. Match finish check
		const remaining = Array.from(this.players.values()).filter(
			(p) => p.matchState === 'playing',
		);
		const totalPlayers = this.players.size;

		if (totalPlayers === 1) {
			if (remaining.length === 0) {
				this.isGameOver = true;
				this.winners = [];
			}
		} else if (remaining.length <= 1) {
			this.isGameOver = true;
			if (remaining.length === 1) {
				const winner = remaining[0]!;
				winner.placement = 1;
				this.winners = [winner.playerId];
			} else {
				this.winners = [];
			}
		}
	}

	private ensureFood(): void {
		while (this.food.length < FOOD_TARGET_COUNT) {
			const x = Math.floor(nextRandom(this.rng) * GRID_WIDTH);
			const y = Math.floor(nextRandom(this.rng) * GRID_HEIGHT);

			// Ensure spot is free from snake bodies
			let occupied = false;
			for (const p of this.players.values()) {
				if (
					p.matchState === 'playing' &&
					p.body.some((b) => b.x === x && b.y === y)
				) {
					occupied = true;
					break;
				}
			}
			if (!occupied) {
				this.food.push({ x, y });
			}
		}
	}

	getPublicSnapshot(): SnakeGameState {
		const snakesRecord: SnakeGameState['snakes'] = {};
		for (const [id, p] of this.players) {
			snakesRecord[id] = {
				body: p.body,
				direction: p.direction,
				score: p.score,
				matchState: p.matchState,
				colorIndex: p.colorIndex,
			};
		}
		return {
			gridWidth: GRID_WIDTH,
			gridHeight: GRID_HEIGHT,
			food: [...this.food],
			snakes: snakesRecord,
		};
	}

	getPlayerSummaries(): Map<string, PlayerGameSummary> {
		const map = new Map<string, PlayerGameSummary>();
		for (const [id, p] of this.players) {
			map.set(id, {
				playerId: id,
				matchState: p.matchState,
				score: p.score,
				placement: p.placement,
				eliminatedAtTick: p.eliminatedAtTick,
			});
		}
		return map;
	}

	isFinished(): boolean {
		return this.isGameOver;
	}

	getWinners(): string[] {
		return [...this.winners];
	}

	getHash(): string {
		let hashStr = `snake:${this.isGameOver}:${this.winners.join(',')}`;
		for (const [id, p] of this.players) {
			hashStr += `;${id}:${p.score}:${p.matchState}:${p.body.map((b) => `${b.x},${b.y}`).join('/')}`;
		}
		return hashStr;
	}
}
