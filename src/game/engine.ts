import { BOARD_CELL_COUNT } from '../shared/constants';
import type { PieceKind } from '../shared/types';
import {
	canPlacePiece,
	assertValidBoard,
	createEmptyBoard,
	isBoardCell,
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
import { getPieceDefinition, isPieceKind } from './pieces';

export interface ActivePiece extends PiecePosition {
	rotation: 0;
}

export interface GameEngineState {
	seed: string;
	rosterIndex: number;
	board: BoardState;
	activePiece: ActivePiece;
	bag: SevenBagState;
	gameOver: boolean;
}

interface SerializedEngineState {
	version: 1;
	seed: string;
	rosterIndex: number;
	board: BoardCell[];
	activePiece: ActivePiece;
	bag: SevenBagState;
	gameOver: boolean;
}

const ENGINE_STATE_VERSION = 1 as const;

const createActivePiece = (kind: PieceKind): ActivePiece => {
	const definition = getPieceDefinition(kind);
	return {
		kind,
		x: definition.spawnX,
		y: definition.spawnY,
		rotation: 0,
	};
};

export const createEngineState = (
	seed: string,
	rosterIndex = 0,
): GameEngineState => {
	const bag = createSevenBag(seed, rosterIndex);
	const activePiece = createActivePiece(drawPiece(bag));
	const state: GameEngineState = {
		seed,
		rosterIndex,
		board: createEmptyBoard(),
		activePiece,
		bag,
		gameOver: false,
	};
	if (!canPlacePiece(state.board, state.activePiece)) {
		state.gameOver = true;
	}
	return state;
};

export const cloneEngineState = (state: GameEngineState): GameEngineState => ({
	seed: state.seed,
	rosterIndex: state.rosterIndex,
	board: { cells: [...state.board.cells] },
	activePiece: { ...state.activePiece },
	bag: cloneSevenBag(state.bag),
	gameOver: state.gameOver,
});

export const moveHorizontal = (
	state: GameEngineState,
	direction: -1 | 1,
): boolean => {
	if (state.gameOver) {
		return false;
	}
	const candidate: ActivePiece = {
		...state.activePiece,
		x: state.activePiece.x + direction,
	};
	if (!canPlacePiece(state.board, candidate)) {
		return false;
	}
	state.activePiece = candidate;
	return true;
};

export const applyHorizontalInput = (
	state: GameEngineState,
	action: 'move_left' | 'move_right',
): boolean => moveHorizontal(state, action === 'move_left' ? -1 : 1);

export const lockActivePiece = (state: GameEngineState): boolean => {
	if (state.gameOver || !placePiece(state.board, state.activePiece)) {
		return false;
	}
	const nextPiece = createActivePiece(drawPiece(state.bag));
	state.activePiece = nextPiece;
	state.gameOver = !canPlacePiece(state.board, nextPiece);
	return true;
};

const serializedState = (state: GameEngineState): SerializedEngineState => ({
	version: ENGINE_STATE_VERSION,
	seed: state.seed,
	rosterIndex: state.rosterIndex,
	board: [...state.board.cells],
	activePiece: { ...state.activePiece },
	bag: {
		seed: state.bag.seed,
		rosterIndex: state.bag.rosterIndex,
		random: { state: state.bag.random.state },
		remaining: [...state.bag.remaining],
	},
	gameOver: state.gameOver,
});

export const serializeEngineState = (state: GameEngineState): string =>
	JSON.stringify(serializedState(state));

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonNegativeInteger = (value: unknown): value is number =>
	typeof value === 'number' && Number.isInteger(value) && value >= 0;

const isRandomState = (value: unknown): value is { state: number } =>
	isRecord(value) &&
	isNonNegativeInteger(value.state) &&
	value.state <= 0xffffffff;

const isActivePiece = (value: unknown): value is ActivePiece =>
	isRecord(value) &&
	typeof value.kind === 'string' &&
	isPieceKind(value.kind) &&
	isNonNegativeInteger(value.x) &&
	isNonNegativeInteger(value.y) &&
	value.rotation === 0;

const isSerializedState = (value: unknown): value is SerializedEngineState => {
	if (!isRecord(value)) {
		return false;
	}
	const bag = value.bag;
	if (!isRecord(bag)) {
		return false;
	}
	const board = value.board;
	const remaining = bag.remaining;
	return (
		value.version === ENGINE_STATE_VERSION &&
		typeof value.seed === 'string' &&
		isNonNegativeInteger(value.rosterIndex) &&
		Array.isArray(board) &&
		board.length === BOARD_CELL_COUNT &&
		board.every((cell) => isBoardCell(cell)) &&
		isActivePiece(value.activePiece) &&
		typeof bag.seed === 'string' &&
		bag.seed === value.seed &&
		isNonNegativeInteger(bag.rosterIndex) &&
		bag.rosterIndex === value.rosterIndex &&
		isRandomState(bag.random) &&
		Array.isArray(remaining) &&
		remaining.length <= 7 &&
		remaining.every((kind) => typeof kind === 'string' && isPieceKind(kind)) &&
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
	if (!isSerializedState(parsed)) {
		throw new Error('Invalid engine state');
	}
	assertValidBoard({ cells: parsed.board });
	return {
		seed: parsed.seed,
		rosterIndex: parsed.rosterIndex,
		board: { cells: [...parsed.board] },
		activePiece: { ...parsed.activePiece },
		bag: {
			seed: parsed.bag.seed,
			rosterIndex: parsed.bag.rosterIndex,
			random: { state: parsed.bag.random.state },
			remaining: [...parsed.bag.remaining],
		},
		gameOver: parsed.gameOver,
	};
};

export const hashEngineState = (state: GameEngineState): string => {
	const input = serializeEngineState(state);
	let hash = 0x811c9dc5;
	for (let index = 0; index < input.length; index += 1) {
		hash ^= input.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, '0');
};
