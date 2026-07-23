import { encodeServerMessage } from '../shared/protocol';
import type { ServerMessage } from '../shared/types';
import type { SocketLike } from './session';

const MAX_CRITICAL_MESSAGES = 32;
const MAX_CONGESTED_DRAINS = 3;

interface SenderState {
	readonly socket: SocketLike;
	pendingSnapshot?: string;
	critical: string[];
	congested: boolean;
	drainCount: number;
}

const states = new WeakMap<SocketLike, SenderState>();
const lastSentAt = new WeakMap<SocketLike, number>();

const stateFor = (socket: SocketLike): SenderState => {
	const existing = states.get(socket);
	if (existing !== undefined) return existing;
	const state: SenderState = {
		socket,
		critical: [],
		congested: false,
		drainCount: 0,
	};
	states.set(socket, state);
	return state;
};

const trySend = (state: SenderState, payload: string): boolean => {
	try {
		const result = state.socket.send(payload);
		lastSentAt.set(state.socket, Date.now());
		return result === undefined || result > 0;
	} catch {
		state.socket.close(1011, 'Send failed');
		return false;
	}
};

const flush = (state: SenderState): void => {
	while (state.critical.length > 0) {
		const message = state.critical[0];
		if (message === undefined || !trySend(state, message)) {
			state.congested = true;
			return;
		}
		state.critical.shift();
	}
	if (state.pendingSnapshot !== undefined) {
		const snapshot = state.pendingSnapshot;
		if (!trySend(state, snapshot)) {
			state.congested = true;
			return;
		}
		delete state.pendingSnapshot;
	}
	state.congested = false;
};

export const sendServerMessage = (
	socket: SocketLike,
	message: ServerMessage,
	replaceable = false,
): void => {
	const state = stateFor(socket);
	const encoded = encodeServerMessage(message);
	if (replaceable) {
		state.pendingSnapshot = encoded;
	} else if (state.critical.length < MAX_CRITICAL_MESSAGES) {
		state.critical.push(encoded);
	} else {
		socket.close(1008, 'Client is too slow');
		return;
	}
	if (!state.congested) flush(state);
};

export const notifySocketDrain = (socket: SocketLike): void => {
	const state = states.get(socket);
	if (state === undefined) return;
	state.drainCount += 1;
	if (state.drainCount > MAX_CONGESTED_DRAINS && state.congested) {
		socket.close(1008, 'Client is too slow');
		return;
	}
	flush(state);
};

export const clearSocketSender = (socket: SocketLike): void => {
	states.delete(socket);
	lastSentAt.delete(socket);
};

export const getLastSentAt = (socket: SocketLike): number | undefined =>
	lastSentAt.get(socket);
