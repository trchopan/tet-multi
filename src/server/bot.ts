import {
	applyInput,
	cloneEngineState,
	type GameEngineState,
} from '../game/engine';
import { getRotationCells, type PieceRotation } from '../game/pieces';
import { canPlacePiece } from '../game/board';
import type { InputAction } from '../shared/types';

const MIN_REACTION_TICKS = 18;
const REACTION_VARIATION_TICKS = 6;
const ACTION_INTERVAL_TICKS = 3;
const GROUNDED_REACTION_TICKS = 3;
const LOOKAHEAD_BEAM_WIDTH = 1;
const NEAR_BEST_CANDIDATE_COUNT = 3;
const NEAR_BEST_SCORE_MARGIN = 20;

interface RotationPath {
	rotationDelta: PieceRotation;
	actions: readonly InputAction[];
}

const ROTATION_PATHS: readonly RotationPath[] = [
	{ rotationDelta: 0, actions: [] },
	{ rotationDelta: 1, actions: ['rotate_cw'] },
	{ rotationDelta: 2, actions: ['rotate_cw', 'rotate_cw'] },
	{ rotationDelta: 3, actions: ['rotate_cw', 'rotate_cw', 'rotate_cw'] },
	{ rotationDelta: 3, actions: ['rotate_ccw'] },
	{ rotationDelta: 2, actions: ['rotate_ccw', 'rotate_ccw'] },
	{
		rotationDelta: 1,
		actions: ['rotate_ccw', 'rotate_ccw', 'rotate_ccw'],
	},
];

interface PlacementCandidate {
	actions: InputAction[];
	score: number;
	after: GameEngineState;
	pieceKey: string;
}

interface PlannedPlacement {
	actions: InputAction[];
	pieceKey: string;
}

export interface BotController {
	plan: InputAction[];
	cooldown: number;
	actionCooldown: number;
	decisionCount: number;
	plannedPieceKey?: string;
}

const phaseOffset = (seed: string, rosterIndex: number): number => {
	let hash = 0x811c9dc5;
	for (let index = 0; index < seed.length; index += 1)
		hash = Math.imul(hash ^ seed.charCodeAt(index), 0x01000193);
	return (hash + rosterIndex * 31) >>> 0;
};

export const createBotController = (
	matchSeed = '',
	rosterIndex = 0,
): BotController => ({
	plan: [],
	cooldown:
		MIN_REACTION_TICKS +
		(matchSeed === ''
			? 0
			: (phaseOffset(matchSeed, rosterIndex) % 4) * REACTION_VARIATION_TICKS),
	actionCooldown: 0,
	decisionCount: 0,
});

export const invalidateBotPlan = (controller: BotController): void => {
	controller.plan = [];
	controller.actionCooldown = 0;
	controller.cooldown = 0;
	delete controller.plannedPieceKey;
};

const pieceKey = (state: GameEngineState): string =>
	[
		state.activePiece.kind,
		state.next.join(''),
		state.hold ?? '-',
		state.holdUsed ? '1' : '0',
		state.bag.random.state,
		state.bag.remaining.join(''),
	].join('|');

const isGrounded = (state: GameEngineState): boolean =>
	!canPlacePiece(state.board, {
		...state.activePiece,
		y: state.activePiece.y + 1,
	});

const columnStats = (
	state: GameEngineState,
): {
	heights: number[];
	holes: number;
	hiddenCells: number;
	wells: number;
} => {
	const heights = Array.from({ length: 10 }, () => 0);
	let holes = 0;
	let hiddenCells = 0;
	for (let x = 0; x < 10; x += 1) {
		let foundBlock = false;
		for (let y = 0; y < 24; y += 1) {
			const occupied = state.board.cells[y * 10 + x] !== 0;
			if (occupied) {
				if (y < 4) hiddenCells += 1;
				if (!foundBlock) heights[x] = 24 - y;
				foundBlock = true;
			} else if (foundBlock) holes += 1;
		}
	}
	let wells = 0;
	for (let x = 1; x < heights.length - 1; x += 1) {
		const depth = Math.min(heights[x - 1]!, heights[x + 1]!) - heights[x]!;
		if (depth > 0) wells += depth;
	}
	return { heights, holes, hiddenCells, wells };
};

const boardScore = (
	before: GameEngineState,
	after: GameEngineState,
	landingHeight: number,
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
	const placement = after.lastPlacement;
	return (
		cleared * 120 -
		(stats.holes * 100 +
			stats.hiddenCells * 80 +
			aggregateHeight * 4 +
			maxHeight * 8 +
			bumpiness * 8 +
			stats.wells * 3 +
			landingHeight * 3) +
		(placement?.attack ?? 0) * 12 +
		(placement?.perfectClear ? 250 : 0)
	);
};

const landingY = (state: GameEngineState): number => {
	let y = state.activePiece.y;
	while (
		canPlacePiece(state.board, {
			...state.activePiece,
			y: y + 1,
		})
	)
		y += 1;
	return y;
};

const candidateFor = (
	state: GameEngineState,
	rotationPath: RotationPath,
	targetX: number,
	prefix: readonly InputAction[] = [],
): PlacementCandidate | undefined => {
	const simulation = cloneEngineState(state);
	const actions: InputAction[] = [...prefix];
	for (const rotationAction of rotationPath.actions) {
		if (!applyInput(simulation, rotationAction, false)) return undefined;
		actions.push(rotationAction);
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
	const dropY = landingY(simulation);
	const activePieceKey = pieceKey(simulation);
	simulation.activePiece.y = dropY;
	applyInput(simulation, 'hard_drop', false);
	if (simulation.gameOver) return undefined;
	actions.push('hard_drop');
	return {
		actions,
		score: boardScore(state, simulation, dropY),
		after: simulation,
		pieceKey: activePieceKey,
	};
};

const enumerateCandidates = (
	state: GameEngineState,
	allowHold: boolean,
): PlacementCandidate[] => {
	const sources: Array<{ state: GameEngineState; prefix: InputAction[] }> = [
		{ state, prefix: [] },
	];
	if (allowHold && !state.holdUsed) {
		const held = cloneEngineState(state);
		if (applyInput(held, 'hold', false))
			sources.push({ state: held, prefix: ['hold'] });
	}
	const candidates: PlacementCandidate[] = [];
	for (const source of sources) {
		for (const rotationPath of ROTATION_PATHS) {
			const finalRotation = ((source.state.activePiece.rotation +
				rotationPath.rotationDelta) %
				4) as PieceRotation;
			const cells = getRotationCells(
				source.state.activePiece.kind,
				finalRotation,
			);
			const minCellX = Math.min(...cells.map((cell) => cell.x));
			const maxCellX = Math.max(...cells.map((cell) => cell.x));
			const minX = -minCellX;
			const maxX = 9 - maxCellX;
			for (let x = minX; x <= maxX; x += 1) {
				const candidate = candidateFor(
					source.state,
					rotationPath,
					x,
					source.prefix,
				);
				if (candidate !== undefined) candidates.push(candidate);
			}
		}
	}
	return candidates;
};

const scoreCandidate = (candidate: PlacementCandidate): number => {
	const nextCandidates = enumerateCandidates(candidate.after, false);
	const bestNext = nextCandidates.reduce(
		(best, next) => Math.max(best, next.score),
		Number.NEGATIVE_INFINITY,
	);
	return candidate.score + (Number.isFinite(bestNext) ? bestNext * 0.7 : 0);
};

const createPlan = (
	state: GameEngineState,
	decisionCount: number,
): PlannedPlacement => {
	const candidates = enumerateCandidates(state, true);
	if (candidates.length === 0)
		return { actions: ['hard_drop'], pieceKey: pieceKey(state) };

	const immediate = [...candidates].sort(
		(first, second) => second.score - first.score,
	);
	const beam = immediate.slice(0, LOOKAHEAD_BEAM_WIDTH);
	for (const candidate of beam) candidate.score = scoreCandidate(candidate);
	beam.sort((first, second) => second.score - first.score);
	const bestScore = beam[0]?.score ?? Number.NEGATIVE_INFINITY;
	const nearBest = beam.filter(
		(candidate) => candidate.score >= bestScore - NEAR_BEST_SCORE_MARGIN,
	);
	const selected =
		nearBest[
			decisionCount % Math.min(NEAR_BEST_CANDIDATE_COUNT, nearBest.length)
		] ?? beam[0];
	if (selected === undefined)
		return { actions: ['hard_drop'], pieceKey: pieceKey(state) };
	return { actions: selected.actions, pieceKey: selected.pieceKey };
};

const reactionDelay = (decisionCount: number): number =>
	MIN_REACTION_TICKS + (decisionCount % 4) * REACTION_VARIATION_TICKS;

export const nextBotAction = (
	controller: BotController,
	state: GameEngineState,
): InputAction | undefined => {
	if (state.gameOver) return undefined;

	if (
		controller.plan.length > 0 &&
		controller.plannedPieceKey !== undefined &&
		controller.plannedPieceKey !== pieceKey(state)
	) {
		invalidateBotPlan(controller);
	}

	if (controller.plan.length === 0) {
		if (isGrounded(state))
			controller.cooldown = Math.min(
				controller.cooldown,
				GROUNDED_REACTION_TICKS,
			);
		if (controller.cooldown > 0) {
			controller.cooldown -= 1;
			return undefined;
		}
		const planned = createPlan(state, controller.decisionCount);
		controller.plan = planned.actions;
		controller.plannedPieceKey = planned.pieceKey;
		controller.decisionCount += 1;
	}

	if (controller.actionCooldown > 0) {
		controller.actionCooldown -= 1;
		return undefined;
	}

	const action = controller.plan.shift();
	if (action === undefined) return undefined;
	if (controller.plan.length === 0) {
		controller.cooldown = reactionDelay(controller.decisionCount);
		controller.actionCooldown = 0;
		delete controller.plannedPieceKey;
	} else controller.actionCooldown = ACTION_INTERVAL_TICKS - 1;
	return action;
};
