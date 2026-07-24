import {
	applyInput,
	cloneEngineState,
	type GameEngineState,
} from '../game/engine';
import type { PieceRotation } from '../game/pieces';
import { canPlacePiece } from '../game/board';
import type { InputAction } from '../shared/types';

const BOT_THINK_TICKS = 8;
const TOP_CANDIDATE_COUNT = 3;

interface PlacementCandidate {
	actions: InputAction[];
	score: number;
}

export interface BotController {
	plan: InputAction[];
	cooldown: number;
	decisionCount: number;
}

export const createBotController = (): BotController => ({
	plan: [],
	cooldown: BOT_THINK_TICKS,
	decisionCount: 0,
});

const columnStats = (
	state: GameEngineState,
): {
	heights: number[];
	holes: number;
} => {
	const heights = Array.from({ length: 10 }, () => 0);
	let holes = 0;
	for (let x = 0; x < 10; x += 1) {
		let foundBlock = false;
		for (let y = 0; y < 24; y += 1) {
			const occupied = state.board.cells[y * 10 + x] !== 0;
			if (occupied) {
				if (!foundBlock) heights[x] = 24 - y;
				foundBlock = true;
			} else if (foundBlock) holes += 1;
		}
	}
	return { heights, holes };
};

const boardScore = (
	before: GameEngineState,
	after: GameEngineState,
): number => {
	const stats = columnStats(after);
	const maxHeight = Math.max(...stats.heights);
	const aggregateHeight = stats.heights.reduce(
		(sum, height) => sum + height,
		0,
	);
	const bumpiness = stats.heights
		.slice(1)
		.reduce(
			(sum, height, index) => sum + Math.abs(height - stats.heights[index]!),
			0,
		);
	const cleared = after.lines - before.lines;
	return (
		cleared * 900 -
		stats.holes * 55 -
		aggregateHeight * 3 -
		maxHeight * 8 -
		bumpiness * 4
	);
};

const candidateFor = (
	state: GameEngineState,
	rotation: PieceRotation,
	targetX: number,
): PlacementCandidate | undefined => {
	const simulation = cloneEngineState(state);
	const actions: InputAction[] = [];
	for (let index = 0; index < rotation; index += 1) {
		if (!applyInput(simulation, 'rotate_cw', false)) return undefined;
		actions.push('rotate_cw');
	}
	while (simulation.activePiece.x < targetX) {
		if (!applyInput(simulation, 'move_right', false)) return undefined;
		actions.push('move_right');
	}
	while (simulation.activePiece.x > targetX) {
		if (!applyInput(simulation, 'move_left', false)) return undefined;
		actions.push('move_left');
	}
	if (!canPlacePiece(simulation.board, simulation.activePiece))
		return undefined;
	applyInput(simulation, 'hard_drop', false);
	if (simulation.gameOver) return undefined;
	actions.push('hard_drop');
	return { actions, score: boardScore(state, simulation) };
};

const createPlan = (
	state: GameEngineState,
	decisionCount: number,
): InputAction[] => {
	const candidates: PlacementCandidate[] = [];
	for (let rotation = 0; rotation < 4; rotation += 1) {
		for (let x = -2; x <= 9; x += 1) {
			const candidate = candidateFor(state, rotation as PieceRotation, x);
			if (candidate !== undefined) candidates.push(candidate);
		}
	}
	if (candidates.length === 0) return ['hard_drop'];
	candidates.sort((first, second) => second.score - first.score);
	const top = candidates.slice(0, TOP_CANDIDATE_COUNT);
	return top[decisionCount % top.length]?.actions ?? ['hard_drop'];
};

export const nextBotAction = (
	controller: BotController,
	state: GameEngineState,
): InputAction | undefined => {
	if (state.gameOver) return undefined;
	if (controller.plan.length === 0) {
		if (controller.cooldown > 0) {
			controller.cooldown -= 1;
			return undefined;
		}
		controller.plan = createPlan(state, controller.decisionCount);
		controller.decisionCount += 1;
	}
	const action = controller.plan.shift();
	if (controller.plan.length === 0) controller.cooldown = BOT_THINK_TICKS;
	return action;
};
