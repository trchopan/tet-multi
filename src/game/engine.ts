import {
	BOARD_CELL_COUNT,
	NEXT_PREVIEW_COUNT,
	SNAPSHOT_CELL_VALUES,
} from '../shared/constants';
import type { InputAction, PieceKind } from '../shared/types';
import {
	canPlacePiece,
	clearLines,
	createEmptyBoard,
	isBoardEmpty,
	placePiece,
	type BoardCell,
	type BoardState,
	type PiecePosition,
} from './board';
import {
	cloneSevenBag,
	createSevenBag,
	drawPiece,
	type SevenBagState,
} from './random';
import { getPieceDefinition, isPieceKind, type PieceRotation } from './pieces';
import { getKickTests } from './rotation';
import { detectTSpin, scorePlacement, type PlacementScore } from './scoring';

export const TICK_RATE = 60;
export const TICK_MS = 1000 / TICK_RATE;
export const LOCK_DELAY_MS = 500;
export const MAX_GROUNDED_RESETS = 15;

export interface ActivePiece extends PiecePosition {
	rotation: PieceRotation;
}

export interface GameEngineState {
	seed: string;
	rosterIndex: number;
	board: BoardState;
	activePiece: ActivePiece;
	bag: SevenBagState;
	next: PieceKind[];
	hold: PieceKind | null;
	holdUsed: boolean;
	gravityMs: number;
	lockMs: number;
	groundedResets: number;
	lastActionWasRotation: boolean;
	lastKickIndex: number;
	score: number;
	lines: number;
	level: number;
	combo: number;
	maxCombo: number;
	backToBack: boolean;
	lastPlacement?: PlacementScore;
	gameOver: boolean;
}

interface SerializedEngineState extends Omit<
	GameEngineState,
	'board' | 'bag' | 'lastPlacement'
> {
	version: 2;
	board: BoardCell[];
	bag: SevenBagState;
	lastPlacement?: PlacementScore;
}

const ENGINE_STATE_VERSION = 2 as const;

const createActivePiece = (kind: PieceKind): ActivePiece => {
	const definition = getPieceDefinition(kind);
	return { kind, x: definition.spawnX, y: definition.spawnY, rotation: 0 };
};

const drawQueuePiece = (state: GameEngineState): PieceKind => {
	const piece = state.next.shift();
	if (piece === undefined) throw new Error('Preview queue is empty');
	state.next.push(drawPiece(state.bag));
	return piece;
};

const isGrounded = (state: GameEngineState): boolean =>
	!canPlacePiece(state.board, {
		...state.activePiece,
		y: state.activePiece.y + 1,
	});

const resetPieceTimers = (state: GameEngineState): void => {
	state.gravityMs = 0;
	state.lockMs = 0;
	state.groundedResets = 0;
};

export const createEngineState = (
	seed: string,
	rosterIndex = 0,
): GameEngineState => {
	const bag = createSevenBag(seed, rosterIndex);
	const activePiece = createActivePiece(drawPiece(bag));
	const next = Array.from({ length: NEXT_PREVIEW_COUNT }, () => drawPiece(bag));
	const state: GameEngineState = {
		seed,
		rosterIndex,
		board: createEmptyBoard(),
		activePiece,
		bag,
		next,
		hold: null,
		holdUsed: false,
		gravityMs: 0,
		lockMs: 0,
		groundedResets: 0,
		lastActionWasRotation: false,
		lastKickIndex: 0,
		score: 0,
		lines: 0,
		level: 0,
		combo: -1,
		maxCombo: -1,
		backToBack: false,
		gameOver: false,
	};
	if (!canPlacePiece(state.board, state.activePiece)) state.gameOver = true;
	return state;
};

export const cloneEngineState = (state: GameEngineState): GameEngineState => {
	const clone: GameEngineState = {
		...state,
		board: { cells: [...state.board.cells] },
		activePiece: { ...state.activePiece },
		bag: cloneSevenBag(state.bag),
		next: [...state.next],
	};
	if (state.lastPlacement) clone.lastPlacement = { ...state.lastPlacement };
	return clone;
};

const applySuccessfulMovement = (
	state: GameEngineState,
	piece: ActivePiece,
	rotated: boolean,
	kickIndex = 0,
): boolean => {
	if (!canPlacePiece(state.board, piece)) return false;
	const grounded = isGrounded(state);
	state.activePiece = piece;
	state.lastActionWasRotation = rotated;
	state.lastKickIndex = kickIndex;
	if (grounded && state.groundedResets < MAX_GROUNDED_RESETS) {
		state.lockMs = 0;
		state.groundedResets += 1;
	}
	return true;
};

export const moveHorizontal = (
	state: GameEngineState,
	direction: -1 | 1,
): boolean =>
	!state.gameOver &&
	applySuccessfulMovement(
		state,
		{ ...state.activePiece, x: state.activePiece.x + direction },
		false,
	);

export const applyRotation = (
	state: GameEngineState,
	clockwise: boolean,
): boolean => {
	if (state.gameOver || state.activePiece.kind === 'O') return false;
	const from = state.activePiece.rotation;
	const to = ((from + (clockwise ? 1 : 3)) % 4) as PieceRotation;
	const kicks = getKickTests(state.activePiece.kind, from, to);
	for (let index = 0; index < kicks.length; index += 1) {
		const kick = kicks[index];
		if (kick === undefined) continue;
		const candidate = {
			...state.activePiece,
			rotation: to,
			x: state.activePiece.x + kick[0],
			y: state.activePiece.y - kick[1],
		};
		if (applySuccessfulMovement(state, candidate, true, index)) return true;
	}
	return false;
};

export const applyHorizontalInput = (
	state: GameEngineState,
	action: 'move_left' | 'move_right',
): boolean => moveHorizontal(state, action === 'move_left' ? -1 : 1);

const lockAndSpawn = (state: GameEngineState): PlacementScore | undefined => {
	if (state.gameOver || !canPlacePiece(state.board, state.activePiece))
		return undefined;
	const tSpin = detectTSpin(
		state.board,
		state.activePiece,
		state.lastActionWasRotation,
		state.lastKickIndex,
	);
	if (!placePiece(state.board, state.activePiece)) return undefined;
	const cleared = clearLines(state.board);
	const placement = scorePlacement(
		cleared,
		state.level,
		state.combo,
		state.backToBack,
		tSpin,
		isBoardEmpty(state.board),
	);
	state.score += placement.points;
	state.lines += cleared;
	state.level = Math.floor(state.lines / 10);
	state.combo = placement.combo;
	state.maxCombo = Math.max(state.maxCombo, state.combo);
	state.backToBack = placement.backToBack;
	state.lastPlacement = placement;
	state.activePiece = createActivePiece(drawQueuePiece(state));
	state.holdUsed = false;
	resetPieceTimers(state);
	state.lastActionWasRotation = false;
	state.lastKickIndex = 0;
	state.gameOver = !canPlacePiece(state.board, state.activePiece);
	return placement;
};

export const lockActivePiece = (state: GameEngineState): boolean =>
	lockAndSpawn(state) !== undefined;

export const hardDrop = (state: GameEngineState): number => {
	if (state.gameOver) return 0;
	let distance = 0;
	while (
		canPlacePiece(state.board, {
			...state.activePiece,
			y: state.activePiece.y + 1,
		})
	) {
		state.activePiece.y += 1;
		distance += 1;
	}
	state.score += distance * 2;
	lockAndSpawn(state);
	return distance;
};

export const softDrop = (state: GameEngineState): boolean => {
	if (
		state.gameOver ||
		!canPlacePiece(state.board, {
			...state.activePiece,
			y: state.activePiece.y + 1,
		})
	)
		return false;
	state.activePiece.y += 1;
	state.score += 1;
	state.lastActionWasRotation = false;
	return true;
};

export const holdPiece = (state: GameEngineState): boolean => {
	if (state.gameOver || state.holdUsed) return false;
	const current = state.activePiece.kind;
	state.activePiece = createActivePiece(state.hold ?? drawQueuePiece(state));
	state.hold = current;
	state.holdUsed = true;
	resetPieceTimers(state);
	state.lastActionWasRotation = false;
	state.lastKickIndex = 0;
	state.gameOver = !canPlacePiece(state.board, state.activePiece);
	return true;
};

export const applyInput = (
	state: GameEngineState,
	action: InputAction,
): boolean => {
	switch (action) {
		case 'move_left':
			return moveHorizontal(state, -1);
		case 'move_right':
			return moveHorizontal(state, 1);
		case 'rotate_cw':
			return applyRotation(state, true);
		case 'rotate_ccw':
			return applyRotation(state, false);
		case 'soft_drop':
			return softDrop(state);
		case 'hard_drop':
			hardDrop(state);
			return true;
		case 'hold':
			return holdPiece(state);
	}
};

export const gravityIntervalMs = (level: number): number =>
	Math.max(80, 800 * 0.85 ** level);

export const advanceTicks = (state: GameEngineState, ticks: number): void => {
	if (!Number.isInteger(ticks) || ticks < 0)
		throw new RangeError('ticks must be a non-negative integer');
	for (let tick = 0; tick < ticks && !state.gameOver; tick += 1) {
		state.gravityMs += TICK_MS;
		while (state.gravityMs >= gravityIntervalMs(state.level)) {
			state.gravityMs -= gravityIntervalMs(state.level);
			if (
				canPlacePiece(state.board, {
					...state.activePiece,
					y: state.activePiece.y + 1,
				})
			) {
				state.activePiece.y += 1;
			} else break;
		}
		if (isGrounded(state)) {
			state.lockMs += TICK_MS;
			if (state.lockMs >= LOCK_DELAY_MS) lockAndSpawn(state);
		} else state.lockMs = 0;
	}
};

const serializedState = (state: GameEngineState): SerializedEngineState => ({
	version: ENGINE_STATE_VERSION,
	seed: state.seed,
	rosterIndex: state.rosterIndex,
	board: [...state.board.cells],
	activePiece: { ...state.activePiece },
	bag: {
		...state.bag,
		random: { ...state.bag.random },
		remaining: [...state.bag.remaining],
	},
	next: [...state.next],
	hold: state.hold,
	holdUsed: state.holdUsed,
	gravityMs: state.gravityMs,
	lockMs: state.lockMs,
	groundedResets: state.groundedResets,
	lastActionWasRotation: state.lastActionWasRotation,
	lastKickIndex: state.lastKickIndex,
	score: state.score,
	lines: state.lines,
	level: state.level,
	combo: state.combo,
	maxCombo: state.maxCombo,
	backToBack: state.backToBack,
	...(state.lastPlacement ? { lastPlacement: { ...state.lastPlacement } } : {}),
	gameOver: state.gameOver,
});

export const serializeEngineState = (state: GameEngineState): string =>
	JSON.stringify(serializedState(state));

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);
const isInteger = (value: unknown): value is number =>
	typeof value === 'number' && Number.isInteger(value);
const isNonNegativeInteger = (value: unknown): value is number =>
	isInteger(value) && value >= 0;
const isNonNegativeNumber = (value: unknown): value is number =>
	typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isPlacementScore = (value: unknown): value is PlacementScore =>
	isRecord(value) &&
	isNonNegativeInteger(value.points) &&
	isNonNegativeInteger(value.attack) &&
	isInteger(value.combo) &&
	typeof value.backToBack === 'boolean' &&
	typeof value.backToBackBonus === 'boolean' &&
	typeof value.perfectClear === 'boolean' &&
	(value.tSpin === 'none' || value.tSpin === 'mini' || value.tSpin === 'full');
const isSerializedState = (value: unknown): value is SerializedEngineState => {
	if (!isRecord(value) || value.version !== ENGINE_STATE_VERSION) return false;
	if (
		!Array.isArray(value.board) ||
		value.board.length !== BOARD_CELL_COUNT ||
		!value.board.every(
			(cell) =>
				typeof cell === 'number' &&
				(SNAPSHOT_CELL_VALUES as readonly number[]).includes(cell),
		)
	)
		return false;
	const bag = value.bag;
	return (
		typeof value.seed === 'string' &&
			isNonNegativeInteger(value.rosterIndex) &&
			Array.isArray(value.board) &&
			value.board.length === BOARD_CELL_COUNT &&
			value.board.every(
				(cell) =>
					typeof cell === 'number' &&
					(SNAPSHOT_CELL_VALUES as readonly number[]).includes(cell),
			),
		isRecord(bag) &&
			typeof bag.seed === 'string' &&
			bag.seed === value.seed &&
			isNonNegativeInteger(bag.rosterIndex) &&
			bag.rosterIndex === value.rosterIndex &&
			isRecord(bag.random) &&
			isNonNegativeInteger(bag.random.state) &&
			bag.random.state <= 0xffffffff &&
			Array.isArray(bag.remaining) &&
			bag.remaining.length <= 7 &&
			bag.remaining.every(
				(kind) => typeof kind === 'string' && isPieceKind(kind),
			) &&
			isRecord(value.activePiece) &&
			typeof value.activePiece.kind === 'string' &&
			isPieceKind(value.activePiece.kind) &&
			isNonNegativeInteger(value.activePiece.x) &&
			isNonNegativeInteger(value.activePiece.y) &&
			isInteger(value.activePiece.rotation) &&
			[0, 1, 2, 3].includes(value.activePiece.rotation) &&
			Array.isArray(value.next) &&
			value.next.length === NEXT_PREVIEW_COUNT &&
			value.next.every(
				(kind) => typeof kind === 'string' && isPieceKind(kind),
			) &&
			(value.hold === null ||
				(typeof value.hold === 'string' && isPieceKind(value.hold))) &&
			typeof value.holdUsed === 'boolean' &&
			isNonNegativeNumber(value.gravityMs) &&
			isNonNegativeNumber(value.lockMs) &&
			isNonNegativeInteger(value.groundedResets) &&
			value.groundedResets <= MAX_GROUNDED_RESETS &&
			typeof value.lastActionWasRotation === 'boolean' &&
			isNonNegativeInteger(value.lastKickIndex) &&
			value.lastKickIndex <= 4 &&
			isNonNegativeInteger(value.score) &&
			isNonNegativeInteger(value.lines) &&
			isNonNegativeInteger(value.level) &&
			isInteger(value.combo) &&
			value.combo >= -1 &&
			isInteger(value.maxCombo) &&
			value.maxCombo >= -1 &&
			typeof value.backToBack === 'boolean' &&
			(!('lastPlacement' in value) || isPlacementScore(value.lastPlacement)) &&
			typeof value.gameOver === 'boolean'
	);
};

export const deserializeEngineState = (serialized: string): GameEngineState => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(serialized) as unknown;
	} catch {
		throw new Error('Invalid engine state JSON');
	}
	if (!isSerializedState(parsed)) throw new Error('Invalid engine state');
	const { version: _version, board, bag, activePiece, ...rest } = parsed;
	return {
		...rest,
		board: { cells: [...board] },
		activePiece: { ...activePiece } as ActivePiece,
		bag: { ...bag, random: { ...bag.random }, remaining: [...bag.remaining] },
	};
};

export const hashEngineState = (state: GameEngineState): string => {
	const input = serializeEngineState(state);
	let hash = 0x811c9dc5;
	for (let index = 0; index < input.length; index += 1)
		hash = Math.imul(hash ^ input.charCodeAt(index), 0x01000193);
	return (hash >>> 0).toString(16).padStart(8, '0');
};
