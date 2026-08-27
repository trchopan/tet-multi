import {
	applyInput,
	cloneEngineState,
	type GameEngineState,
} from '$/games/falling-blocks/domain/core-engine';
import {
	getRotationCells,
	type PieceRotation,
} from '$/games/falling-blocks/domain/pieces';
import { canPlacePiece } from '$/games/falling-blocks/domain/board';
import { DEFAULT_COMPUTER_DIFFICULTY } from '$/shared/constants';
import type { ComputerDifficulty, InputAction } from '$/shared/types';

interface BotProfile {
	minimumReactionTicks: number;
	reactionVariationTicks: number;
	actionIntervalTicks: number;
	groundedReactionTicks: number;
	lookaheadBeamWidth: number;
	nearBestCandidateCount: number;
	nearBestScoreMargin: number;
	lookaheadWeight: number;
	allowHold: boolean;
}

const BOT_PROFILES: Readonly<Record<ComputerDifficulty, BotProfile>> = {
	beginner: {
		minimumReactionTicks: 45,
		reactionVariationTicks: 15,
		actionIntervalTicks: 6,
		groundedReactionTicks: 8,
		lookaheadBeamWidth: 12,
		nearBestCandidateCount: 8,
		nearBestScoreMargin: 500,
		lookaheadWeight: 0,
		allowHold: false,
	},
	challenger: {
		minimumReactionTicks: 30,
		reactionVariationTicks: 9,
		actionIntervalTicks: 4,
		groundedReactionTicks: 5,
		lookaheadBeamWidth: 4,
		nearBestCandidateCount: 3,
		nearBestScoreMargin: 100,
		lookaheadWeight: 0,
		allowHold: true,
	},
	legendary: {
		minimumReactionTicks: 18,
		reactionVariationTicks: 6,
		actionIntervalTicks: 3,
		groundedReactionTicks: 3,
		lookaheadBeamWidth: 1,
		nearBestCandidateCount: 3,
		nearBestScoreMargin: 20,
		lookaheadWeight: 0.7,
		allowHold: true,
	},
};

const profileFor = (difficulty: ComputerDifficulty): BotProfile => {
	const profile = BOT_PROFILES[difficulty];
	if (profile === undefined)
		throw new Error(`Unknown bot difficulty: ${difficulty}`);
	return profile;
};

interface RotationPath {
	rotationDelta: PieceRotation;
	actions: readonly InputAction[];
}

const ROTATION_PATHS: readonly RotationPath[] = [
	{ rotationDelta: 0, actions: [] },
	{ rotationDelta: 1, actions: ['button_x'] },
	{ rotationDelta: 2, actions: ['button_x', 'button_x'] },
	{ rotationDelta: 3, actions: ['button_x', 'button_x', 'button_x'] },
	{ rotationDelta: 3, actions: ['button_b'] },
	{ rotationDelta: 2, actions: ['button_b', 'button_b'] },
	{
		rotationDelta: 1,
		actions: ['button_b', 'button_b', 'button_b'],
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
	difficulty: ComputerDifficulty;
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
	difficulty: ComputerDifficulty = DEFAULT_COMPUTER_DIFFICULTY,
): BotController => {
	const profile = profileFor(difficulty);
	return {
		difficulty,
		plan: [],
		cooldown:
			profile.minimumReactionTicks +
			(matchSeed === ''
				? 0
				: (phaseOffset(matchSeed, rosterIndex) % 4) *
					profile.reactionVariationTicks),
		actionCooldown: 0,
		decisionCount: 0,
	};
};

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
		if (!applyInput(simulation, 'right', false)) return undefined;
		actions.push('right');
	}
	while (simulation.activePiece.x > targetX) {
		if (!applyInput(simulation, 'left', false)) return undefined;
		actions.push('left');
	}
	if (!canPlacePiece(simulation.board, simulation.activePiece))
		return undefined;
	const dropY = landingY(simulation);
	const activePieceKey = pieceKey(simulation);
	simulation.activePiece.y = dropY;
	applyInput(simulation, 'button_a', false);
	if (simulation.gameOver) return undefined;
	actions.push('button_a');
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
		if (applyInput(held, 'button_y', false))
			sources.push({ state: held, prefix: ['button_y'] });
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

const scoreCandidateFor = (
	candidate: PlacementCandidate,
	lookaheadWeight: number,
): number => {
	if (lookaheadWeight === 0) return candidate.score;
	const nextCandidates = enumerateCandidates(candidate.after, false);
	const bestNext = nextCandidates.reduce(
		(best, next) => Math.max(best, next.score),
		Number.NEGATIVE_INFINITY,
	);
	return (
		candidate.score +
		(Number.isFinite(bestNext) ? bestNext * lookaheadWeight : 0)
	);
};

const createPlan = (
	state: GameEngineState,
	decisionCount: number,
	profile: BotProfile,
): PlannedPlacement => {
	const candidates = enumerateCandidates(state, profile.allowHold);
	if (candidates.length === 0)
		return { actions: ['button_a'], pieceKey: pieceKey(state) };

	const immediate = [...candidates].sort(
		(first, second) => second.score - first.score,
	);
	const beam = immediate.slice(0, profile.lookaheadBeamWidth);
	for (const candidate of beam)
		candidate.score = scoreCandidateFor(candidate, profile.lookaheadWeight);
	beam.sort((first, second) => second.score - first.score);
	const bestScore = beam[0]?.score ?? Number.NEGATIVE_INFINITY;
	const nearBest = beam.filter(
		(candidate) => candidate.score >= bestScore - profile.nearBestScoreMargin,
	);
	const selected =
		nearBest[
			decisionCount % Math.min(profile.nearBestCandidateCount, nearBest.length)
		] ?? beam[0];
	if (selected === undefined)
		return { actions: ['button_a'], pieceKey: pieceKey(state) };
	return { actions: selected.actions, pieceKey: selected.pieceKey };
};

const reactionDelay = (decisionCount: number, profile: BotProfile): number =>
	profile.minimumReactionTicks +
	(decisionCount % 4) * profile.reactionVariationTicks;

export const nextBotAction = (
	controller: BotController,
	state: GameEngineState,
): InputAction | undefined => {
	if (state.gameOver) return undefined;
	const profile = profileFor(controller.difficulty);

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
				profile.groundedReactionTicks,
			);
		if (controller.cooldown > 0) {
			controller.cooldown -= 1;
			return undefined;
		}
		const planned = createPlan(state, controller.decisionCount, profile);
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
		controller.cooldown = reactionDelay(controller.decisionCount, profile);
		controller.actionCooldown = 0;
		delete controller.plannedPieceKey;
	} else controller.actionCooldown = profile.actionIntervalTicks - 1;
	return action;
};
