import type {
	EngineInitPlayer,
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
} from '../../shared/random';
import {
	createSnakeBotController,
	nextSnakeBotAction,
	type SnakeBotController,
} from './bot';

const GRID_WIDTH = 40;
const GRID_HEIGHT = 30;
const INITIAL_SNAKE_LENGTH = 4;
const MAX_SNAKE_LENGTH = 20;
const FOOD_TARGET_COUNT = 8;
const MOVE_EVERY_N_TICKS = 16; // Advance snake physics every 16 server ticks (3.75 moves/sec at 60Hz)

const STARTING_POSITIONS: { pos: Position; dir: SnakeDirection }[] = [
	{ pos: { x: 5, y: 5 }, dir: 'right' },
	{ pos: { x: 34, y: 24 }, dir: 'left' },
	{ pos: { x: 34, y: 5 }, dir: 'down' },
	{ pos: { x: 5, y: 24 }, dir: 'up' },
	{ pos: { x: 20, y: 15 }, dir: 'right' },
];

const OPPOSITE_DIRECTIONS: Record<SnakeDirection, SnakeDirection> = {
	up: 'down',
	down: 'up',
	left: 'right',
	right: 'left',
};

export const getSnakeSize = (p: {
	levels?: number[];
	body: Position[];
}): number => {
	if (!p.levels || p.levels.length === 0) return p.body.length;
	return p.levels.reduce((sum, lvl) => sum + lvl, 0);
};

export class SnakeGameEngine implements GameEngine<
	SnakeGameState,
	SnakeInputAction
> {
	private readonly rng: RandomState;
	private readonly players = new Map<string, SnakePlayerState>();
	readonly botControllers = new Map<string, SnakeBotController>();
	private food: Position[] = [];
	private isGameOver = false;
	private winners: string[] = [];

	constructor(
		_matchId: string,
		seed: string,
		roster: readonly EngineInitPlayer[],
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

			const levels = Array(INITIAL_SNAKE_LENGTH).fill(1);

			this.players.set(p.playerId, {
				playerId: p.playerId,
				displayName: p.displayName,
				body,
				levels,
				direction: start.dir,
				nextDirection: start.dir,
				score: 0,
				matchState: 'playing',
				colorIndex: i,
			});

			if (p.playerType === 'computer') {
				this.botControllers.set(
					p.playerId,
					createSnakeBotController(seed, i, p.computerDifficulty),
				);
			}
		}

		this.ensureFood();
	}

	tick(
		serverTick: number,
		inputs: readonly PlayerInputEnvelope<SnakeInputAction>[],
	): void {
		if (this.isGameOver) return;

		const allInputs: PlayerInputEnvelope<SnakeInputAction>[] = [...inputs];

		// Generate inputs for active bot controllers on move ticks
		if (serverTick % MOVE_EVERY_N_TICKS === 0) {
			const currentSnapshot = this.getPublicSnapshot();
			for (const [playerId, controller] of this.botControllers.entries()) {
				const botAction = nextSnakeBotAction(
					controller,
					currentSnapshot,
					playerId,
					serverTick,
				);
				if (botAction) {
					allInputs.push({
						playerId,
						sequence: serverTick,
						action: botAction,
					});
				}
			}
		}

		// 1. Process direction inputs
		for (const env of allInputs) {
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

		// 3. Collision Checks & Resolutions (4-Phase Resolution)
		const eliminatedThisTick = new Set<string>();
		const bouncedThisTick = new Set<string>();
		const wallShedThisTick = new Set<string>();

		// Phase 3A: Wall collisions & Self-collisions
		for (const [id, newHead] of newHeads) {
			const player = this.players.get(id)!;
			if (
				newHead.x < 0 ||
				newHead.x >= GRID_WIDTH ||
				newHead.y < 0 ||
				newHead.y >= GRID_HEIGHT
			) {
				const size = getSnakeSize(player);
				if (size > 1) {
					bouncedThisTick.add(id);
					wallShedThisTick.add(id);
				} else {
					eliminatedThisTick.add(id);
				}
				continue;
			}
			// Self-collision
			for (let i = 0; i < player.body.length - 1; i++) {
				const seg = player.body[i]!;
				if (seg.x === newHead.x && seg.y === newHead.y) {
					eliminatedThisTick.add(id);
					break;
				}
			}
		}

		// Phase 3B: Head vs Head collisions
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
					const sizeA = getSnakeSize(pA);
					const sizeB = getSnakeSize(pB);

					if (sizeA > sizeB) {
						eliminatedThisTick.add(idB);
						pA.score += 300;
					} else if (sizeB > sizeA) {
						eliminatedThisTick.add(idA);
						pB.score += 300;
					} else {
						// Equal size -> both bounce!
						bouncedThisTick.add(idA);
						bouncedThisTick.add(idB);
					}
				}
			}
		}

		// Phase 3C: Head vs Other Body collisions (Neck Biting & Bounce Reject)
		for (const [id, newHead] of newHeads) {
			if (eliminatedThisTick.has(id) || bouncedThisTick.has(id)) continue;
			const player = this.players.get(id)!;
			const sizeSelf = getSnakeSize(player);

			for (const otherPlayer of this.players.values()) {
				if (otherPlayer.playerId === id || otherPlayer.matchState !== 'playing')
					continue;

				for (let i = 0; i < otherPlayer.body.length; i++) {
					const seg = otherPlayer.body[i]!;
					if (seg.x === newHead.x && seg.y === newHead.y) {
						const sizeOther = getSnakeSize(otherPlayer);
						const isNeck = i >= Math.max(1, otherPlayer.body.length - 3);

						if (isNeck && sizeSelf > sizeOther) {
							// Neck Bite Kill!
							eliminatedThisTick.add(otherPlayer.playerId);
							player.score += 300;
						} else {
							// Reject / Bounce Effect!
							bouncedThisTick.add(id);
						}
						break;
					}
				}
				if (eliminatedThisTick.has(id) || bouncedThisTick.has(id)) break;
			}
		}

		// Phase 3C.1: Trap / Corner Check for Bounced Snakes
		for (const id of Array.from(bouncedThisTick)) {
			const player = this.players.get(id)!;
			const targetHead = player.body[player.body.length - 1]!;

			if (
				targetHead.x < 0 ||
				targetHead.x >= GRID_WIDTH ||
				targetHead.y < 0 ||
				targetHead.y >= GRID_HEIGHT
			) {
				bouncedThisTick.delete(id);
				wallShedThisTick.delete(id);
				eliminatedThisTick.add(id);
				continue;
			}

			for (const otherPlayer of this.players.values()) {
				if (otherPlayer.playerId === id || otherPlayer.matchState !== 'playing')
					continue;
				if (
					otherPlayer.body.some(
						(seg) => seg.x === targetHead.x && seg.y === targetHead.y,
					)
				) {
					bouncedThisTick.delete(id);
					wallShedThisTick.delete(id);
					eliminatedThisTick.add(id);
					break;
				}
			}
		}

		// Phase 3D: Apply Eliminations (100% Body to Food conversion)
		if (eliminatedThisTick.size > 0) {
			const activeCount = Array.from(this.players.values()).filter(
				(p) => p.matchState === 'playing',
			).length;
			const placement = activeCount - eliminatedThisTick.size + 1;

			for (const id of eliminatedThisTick) {
				bouncedThisTick.delete(id);
				wallShedThisTick.delete(id);
				const player = this.players.get(id)!;
				player.matchState = 'eliminated';
				player.eliminatedAtTick = serverTick;
				player.placement = placement;

				// 100% of body segments turn into food!
				for (const seg of player.body) {
					this.food.push({ ...seg });
				}
			}
		}

		// Phase 4: Apply Movement, Bounce & Food Eating
		for (const [id, newHead] of newHeads) {
			if (eliminatedThisTick.has(id)) continue;
			const player = this.players.get(id)!;

			if (bouncedThisTick.has(id)) {
				// Wall Bounce Shed Penalty
				if (wallShedThisTick.has(id)) {
					// Drop food at wall impact point (clamped to grid)
					const impactX = Math.max(0, Math.min(GRID_WIDTH - 1, newHead.x));
					const impactY = Math.max(0, Math.min(GRID_HEIGHT - 1, newHead.y));
					this.food.push({ x: impactX, y: impactY });

					// Shed 1 segment/level from snake
					if (player.levels.length > 0 && Math.max(...player.levels) > 1) {
						const idx = player.levels.findIndex((lvl) => lvl > 1);
						const currLvl = player.levels[idx];
						if (idx !== -1 && currLvl !== undefined) {
							player.levels[idx] = currLvl - 1;
						}
					} else if (player.body.length > 1) {
						player.body.pop();
						player.levels.pop();
					}
				}

				// Bounce Reject Effect!
				player.body.reverse();
				player.levels.reverse();
				const oppDir = OPPOSITE_DIRECTIONS[player.direction];
				player.direction = oppDir;
				player.nextDirection = oppDir;
			} else {
				// Check food collision
				const foodIndex = this.food.findIndex(
					(f) => f.x === newHead.x && f.y === newHead.y,
				);
				if (foodIndex !== -1) {
					// Eat food!
					this.food.splice(foodIndex, 1);

					if (player.body.length < MAX_SNAKE_LENGTH) {
						player.body.unshift(newHead);
						player.levels.unshift(1);
						player.score += 100;
					} else {
						// At Max Length (20) -> Evolve segment levels!
						player.body.unshift(newHead);
						player.body.pop();

						const minLvl = Math.min(...player.levels);
						const maxLvl = Math.max(...player.levels);
						const targetLevel = minLvl === maxLvl ? minLvl + 1 : maxLvl;

						const upgradeIdx = player.levels.findIndex(
							(lvl) => lvl < targetLevel,
						);
						const targetIdx = upgradeIdx !== -1 ? upgradeIdx : 0;
						const currLvl = player.levels[targetIdx] ?? 1;
						player.levels[targetIdx] = currLvl + 1;
						player.score += 100 * targetLevel;
					}
				} else {
					// Normal step
					player.body.unshift(newHead);
					player.body.pop();
				}
			}
		}

		this.ensureFood();

		// 5. Match finish check
		this.checkMatchEnd();
	}

	public eliminatePlayers(playerIds: readonly string[]): void {
		if (this.isGameOver) return;
		for (const id of playerIds) {
			const player = this.players.get(id);
			if (player && player.matchState === 'playing') {
				player.matchState = 'eliminated';
				for (const seg of player.body) {
					this.food.push({ ...seg });
				}
			}
		}
		this.ensureFood();
		this.checkMatchEnd();
	}

	private checkMatchEnd(): void {
		if (this.isGameOver) return;

		const remaining = Array.from(this.players.values()).filter(
			(p) => p.matchState === 'playing',
		);
		const totalPlayers = this.players.size;

		if (totalPlayers === 1) {
			if (remaining.length === 0) {
				this.isGameOver = true;
				this.winners = [];
			}
			return;
		}

		if (remaining.length <= 1) {
			this.isGameOver = true;
			const winner = remaining[0];
			if (remaining.length === 1 && winner) {
				winner.placement = 1;
				this.winners = [winner.playerId];
			} else {
				this.winners = [];
			}
			return;
		}

		// Check if all human players have been eliminated when match started with human player(s)
		const hasHumanPlayers = Array.from(this.players.keys()).some(
			(id) => !this.botControllers.has(id),
		);
		const hasActiveHuman = Array.from(this.players.values()).some(
			(p) => p.matchState === 'playing' && !this.botControllers.has(p.playerId),
		);

		if (hasHumanPlayers && !hasActiveHuman) {
			this.isGameOver = true;
			const activeComputers = remaining.filter((p) =>
				this.botControllers.has(p.playerId),
			);
			for (const comp of activeComputers) {
				comp.placement = 1;
			}
			this.winners = activeComputers.map((c) => c.playerId);
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
				levels: [...p.levels],
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
			hashStr += `;${id}:${p.score}:${p.matchState}:${p.body.map((b, idx) => `${b.x},${b.y}:${p.levels[idx] ?? 1}`).join('/')}`;
		}
		return hashStr;
	}
}
