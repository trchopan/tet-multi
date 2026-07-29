import {
	applyInput,
	createEngineState,
	type GameEngineState,
} from '../../games/falling-blocks/core-engine';
import {
	serializeBoard,
	type BoardCell,
} from '../../games/falling-blocks/board';
import type { InputAction, PlayerSnapshot } from '../../shared/types';

export interface PendingInput {
	sequence: number;
	action: InputAction;
}

const authoritativeActions = new Set<InputAction>(['button_a', 'button_y']);

export const isPredictableInput = (action: InputAction): boolean =>
	!authoritativeActions.has(action);

export const createPredictionState = (
	player: PlayerSnapshot,
): GameEngineState | undefined => {
	if (player.board === undefined || player.activePiece === undefined)
		return undefined;
	const state = createEngineState('client-prediction');
	state.board.cells = [...player.board] as BoardCell[];
	state.activePiece = { ...player.activePiece };
	state.hold = player.hold ?? null;
	state.next = [...(player.next ?? state.next)];
	state.gameOver = player.matchState === 'eliminated';
	return state;
};

export const applyPendingInputs = (
	state: GameEngineState,
	pending: readonly PendingInput[],
): void => {
	for (const input of pending)
		if (isPredictableInput(input.action))
			applyInput(state, input.action, false);
};

export const reconcilePrediction = (
	player: PlayerSnapshot,
	pending: readonly PendingInput[],
): { state: GameEngineState; pending: PendingInput[] } | undefined => {
	const state = createPredictionState(player);
	if (state === undefined) return undefined;
	const acknowledged = player.lastProcessedInput ?? 0;
	const remaining = pending.filter((input) => input.sequence > acknowledged);
	applyPendingInputs(state, remaining);
	return { state, pending: remaining };
};

export const predictionToSnapshot = (
	player: PlayerSnapshot,
	state: GameEngineState,
): PlayerSnapshot => ({
	...player,
	board: serializeBoard(state.board),
	activePiece: { ...state.activePiece },
	...(state.hold === null ? {} : { hold: state.hold }),
	next: [...state.next],
});
