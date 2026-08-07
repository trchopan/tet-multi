import type {
	Position,
	SnakeDirection,
	SnakeGameState,
	SnakeInputAction,
} from '$/games/snake/types';
import type { ComputerDifficulty } from '$/shared/types';
import {
	createRandomState,
	nextRandom,
	type RandomState,
} from '$/shared/random';

const GRID_WIDTH = 40;
const GRID_HEIGHT = 30;

export interface SnakeBotController {
	readonly difficulty: ComputerDifficulty;
	readonly rng: RandomState;
}

export const createSnakeBotController = (
	seed: string,
	playerIndex: number,
	difficulty: ComputerDifficulty = 'challenger',
): SnakeBotController => {
	return {
		difficulty,
		rng: createRandomState(seed, playerIndex + 100),
	};
};

const DIRECTION_OFFSETS: Record<SnakeDirection, Position> = {
	up: { x: 0, y: -1 },
	down: { x: 0, y: 1 },
	left: { x: -1, y: 0 },
	right: { x: 1, y: 0 },
};

const OPPOSITE_DIRECTIONS: Record<SnakeDirection, SnakeDirection> = {
	up: 'down',
	down: 'up',
	left: 'right',
	right: 'left',
};

const ALL_DIRECTIONS: readonly SnakeDirection[] = [
	'up',
	'down',
	'left',
	'right',
];

const posKey = (x: number, y: number): string => `${x},${y}`;

function getSnakeSize(snake?: { body: Position[]; levels?: number[] }): number {
	if (!snake) return 0;
	if (snake.levels && snake.levels.length > 0) {
		return snake.levels.reduce((a, b) => a + b, 0);
	}
	return snake.body.length;
}

/** Build set of blocked coordinates (walls, snake bodies) */
function getBlockedGrid(
	gameState: SnakeGameState,
	selfId: string,
	includeOpponentHeadThreats: boolean,
): Set<string> {
	const blocked = new Set<string>();

	const selfSnake = gameState.snakes[selfId];
	const selfSize = getSnakeSize(selfSnake);

	for (const [id, snake] of Object.entries(gameState.snakes)) {
		if (snake.matchState !== 'playing' || snake.body.length === 0) continue;
		const snakeSize = getSnakeSize(snake);
		const len = snake.body.length;
		const isSelf = id === selfId;

		for (let i = 0; i < len; i++) {
			const seg = snake.body[i]!;
			if (isSelf) {
				blocked.add(posKey(seg.x, seg.y));
			} else {
				const isNeck = i >= Math.max(1, len - 3);
				if (isNeck && selfSize > snakeSize) {
					// Allow larger bot to step on smaller snake's neck
				} else {
					blocked.add(posKey(seg.x, seg.y));
				}
			}
		}

		// Opponent head-on collision threat zone for equal or larger snakes
		if (includeOpponentHeadThreats && !isSelf && snakeSize >= selfSize) {
			const head = snake.body[0]!;
			for (const dir of ALL_DIRECTIONS) {
				const offset = DIRECTION_OFFSETS[dir];
				const tx = head.x + offset.x;
				const ty = head.y + offset.y;
				if (tx >= 0 && tx < GRID_WIDTH && ty >= 0 && ty < GRID_HEIGHT) {
					blocked.add(posKey(tx, ty));
				}
			}
		}
	}

	return blocked;
}

/** Compute flood fill reachable space count from a starting position */
function countReachableArea(
	startPos: Position,
	blocked: Set<string>,
	maxCount: number,
): number {
	const visited = new Set<string>([posKey(startPos.x, startPos.y)]);
	const queue: Position[] = [startPos];
	let count = 0;

	while (queue.length > 0 && count < maxCount) {
		const curr = queue.shift()!;
		count++;

		for (const dir of ALL_DIRECTIONS) {
			const offset = DIRECTION_OFFSETS[dir];
			const nx = curr.x + offset.x;
			const ny = curr.y + offset.y;

			if (nx < 0 || nx >= GRID_WIDTH || ny < 0 || ny >= GRID_HEIGHT) continue;

			const key = posKey(nx, ny);
			if (blocked.has(key) || visited.has(key)) continue;

			visited.add(key);
			queue.push({ x: nx, y: ny });
		}
	}

	return count;
}

/** Find shortest path to nearest food using BFS */
function findShortestPathToFood(
	startPos: Position,
	foodPositions: readonly Position[],
	blocked: Set<string>,
): SnakeDirection | undefined {
	if (foodPositions.length === 0) return undefined;

	const foodSet = new Set(foodPositions.map((f) => posKey(f.x, f.y)));
	const visited = new Set<string>([posKey(startPos.x, startPos.y)]);

	// Store queue item as [currentPosition, firstMoveDirection]
	const queue: Array<{ pos: Position; firstDir: SnakeDirection }> = [];

	for (const dir of ALL_DIRECTIONS) {
		const offset = DIRECTION_OFFSETS[dir];
		const nx = startPos.x + offset.x;
		const ny = startPos.y + offset.y;

		if (nx < 0 || nx >= GRID_WIDTH || ny < 0 || ny >= GRID_HEIGHT) continue;

		const key = posKey(nx, ny);
		if (blocked.has(key)) continue;

		if (foodSet.has(key)) return dir;

		visited.add(key);
		queue.push({ pos: { x: nx, y: ny }, firstDir: dir });
	}

	while (queue.length > 0) {
		const item = queue.shift()!;

		for (const dir of ALL_DIRECTIONS) {
			const offset = DIRECTION_OFFSETS[dir];
			const nx = item.pos.x + offset.x;
			const ny = item.pos.y + offset.y;

			if (nx < 0 || nx >= GRID_WIDTH || ny < 0 || ny >= GRID_HEIGHT) continue;

			const key = posKey(nx, ny);
			if (visited.has(key) || blocked.has(key)) continue;

			if (foodSet.has(key)) return item.firstDir;

			visited.add(key);
			queue.push({ pos: { x: nx, y: ny }, firstDir: item.firstDir });
		}
	}

	return undefined;
}

export function nextSnakeBotAction(
	controller: SnakeBotController,
	gameState: SnakeGameState,
	playerId: string,
	_serverTick: number,
): SnakeInputAction | undefined {
	const snake = gameState.snakes[playerId];
	if (!snake || snake.matchState !== 'playing' || snake.body.length === 0) {
		return undefined;
	}

	const head = snake.body[0]!;
	const currDir = snake.direction;
	const oppositeDir = OPPOSITE_DIRECTIONS[currDir];
	const difficulty = controller.difficulty;

	const useHeadThreats = difficulty === 'legendary';
	const blocked = getBlockedGrid(gameState, playerId, useHeadThreats);

	// Required flood-fill safety area based on difficulty & snake length
	let minSafeArea = 6;
	if (difficulty === 'challenger') {
		minSafeArea = Math.max(12, snake.body.length);
	} else if (difficulty === 'legendary') {
		minSafeArea = Math.max(20, snake.body.length + 4);
	}

	// Filter valid directions (not 180-degree turn, not out of bounds, not immediate collision)
	const candidateMoves: Array<{
		dir: SnakeDirection;
		nextPos: Position;
		area: number;
	}> = [];

	for (const dir of ALL_DIRECTIONS) {
		if (dir === oppositeDir) continue;

		const offset = DIRECTION_OFFSETS[dir];
		const nx = head.x + offset.x;
		const ny = head.y + offset.y;

		if (nx < 0 || nx >= GRID_WIDTH || ny < 0 || ny >= GRID_HEIGHT) continue;

		const key = posKey(nx, ny);
		if (blocked.has(key)) continue;

		const area = countReachableArea({ x: nx, y: ny }, blocked, minSafeArea * 2);
		candidateMoves.push({ dir, nextPos: { x: nx, y: ny }, area });
	}

	// If no safe candidate move, try without opponent head threat padding
	if (candidateMoves.length === 0 && useHeadThreats) {
		const fallbackBlocked = getBlockedGrid(gameState, playerId, false);
		for (const dir of ALL_DIRECTIONS) {
			if (dir === oppositeDir) continue;

			const offset = DIRECTION_OFFSETS[dir];
			const nx = head.x + offset.x;
			const ny = head.y + offset.y;

			if (nx < 0 || nx >= GRID_WIDTH || ny < 0 || ny >= GRID_HEIGHT) continue;
			if (fallbackBlocked.has(posKey(nx, ny))) continue;

			const area = countReachableArea({ x: nx, y: ny }, fallbackBlocked, 20);
			candidateMoves.push({ dir, nextPos: { x: nx, y: ny }, area });
		}
	}

	// If still no non-colliding moves, bot cannot avoid crash
	if (candidateMoves.length === 0) {
		return undefined;
	}

	// Beginner difficulty: 20% chance to pick a random safe move instead of optimal food path
	if (difficulty === 'beginner' && nextRandom(controller.rng) < 0.2) {
		const idx = Math.floor(nextRandom(controller.rng) * candidateMoves.length);
		return candidateMoves[idx]?.dir;
	}

	// Try finding shortest path to food
	const foodDir = findShortestPathToFood(head, gameState.food, blocked);

	if (foodDir && candidateMoves.some((m) => m.dir === foodDir)) {
		const foodMove = candidateMoves.find((m) => m.dir === foodDir)!;
		// Check if food path direction has adequate area
		if (foodMove.area >= minSafeArea) {
			return foodDir;
		}
	}

	// Fallback / Survival: Pick move with largest reachable area
	candidateMoves.sort((a, b) => b.area - a.area);
	return candidateMoves[0]?.dir;
}
