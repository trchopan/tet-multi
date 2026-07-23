import type { ServerWebSocket } from 'bun';
import type { PlayerMatchState } from '../shared/types';

export interface SocketLike {
	readonly readyState?: number;
	send(data: string): void;
	close(code?: number, reason?: string): void;
}

export type SessionSocket = ServerWebSocket<unknown> & SocketLike;

export const createReconnectToken = (): string => {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
		'',
	);
};

export interface Session {
	playerId: string;
	clientId: string;
	displayName: string;
	roomCode: string;
	reconnectToken: string;
	joinedAt: number;
	connected: boolean;
	ready: boolean;
	matchState: PlayerMatchState;
	reconnectDeadline?: number;
	socket?: SocketLike;
}

export const createSession = (input: {
	playerId: string;
	clientId: string;
	displayName: string;
	roomCode: string;
	reconnectToken: string;
	joinedAt: number;
	socket: SocketLike;
}): Session => ({
	...input,
	connected: true,
	ready: false,
	matchState: 'waiting',
});
