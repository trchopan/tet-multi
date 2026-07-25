import type { ServerWebSocket } from 'bun';
import { DEFAULT_COMPUTER_DIFFICULTY } from '../shared/constants';
import type {
	ComputerDifficulty,
	PlayerMatchState,
	PlayerType,
} from '../shared/types';

export interface SocketLike {
	readonly readyState?: number;
	send(data: string): number | void;
	close(code?: number, reason?: string): void;
}

export type SocketWithData<T> = SocketLike & { data: T };

export type SessionSocket = ServerWebSocket<unknown> & SocketLike;

export const createReconnectToken = (): string => {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
		'',
	);
};

export const reconnectTokensEqual = (
	first: string,
	second: string,
): boolean => {
	const length = Math.max(first.length, second.length);
	let difference = first.length ^ second.length;
	for (let index = 0; index < length; index += 1)
		difference |=
			(first.charCodeAt(index) || 0) ^ (second.charCodeAt(index) || 0);
	return difference === 0;
};

export interface Session {
	playerId: string;
	clientId: string;
	playerType: PlayerType;
	computerDifficulty?: ComputerDifficulty;
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
	playerType: 'human',
	connected: true,
	ready: false,
	matchState: 'waiting',
});

export const createComputerSession = (input: {
	playerId: string;
	displayName: string;
	roomCode: string;
	joinedAt: number;
	difficulty?: ComputerDifficulty;
}): Session => {
	const { difficulty, ...session } = input;
	return {
		...session,
		clientId: `computer:${input.playerId}`,
		reconnectToken: '',
		playerType: 'computer',
		computerDifficulty: difficulty ?? DEFAULT_COMPUTER_DIFFICULTY,
		connected: true,
		ready: true,
		matchState: 'waiting',
	};
};
