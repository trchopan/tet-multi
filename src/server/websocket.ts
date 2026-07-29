import { decodeClientMessage } from '../shared/protocol';
import { PROTOCOL_VERSION } from '../shared/constants';
import type { ClientMessage, ErrorCode, ServerMessage } from '../shared/types';
import { errorMessage, roomErrorMessage, RoomManager } from './room-manager';
import type { Session, SocketLike } from './session';
import {
	sendServerMessage,
	notifySocketDrain,
	clearSocketSender,
	getLastSentAt,
} from './socket-sender';
import { SlidingWindowRateLimiter } from './rate-limit';
import type { Logger } from './logger';

export interface SocketData {
	hello: boolean;
	clientId?: string;
	session?: Session;
	invalidMessages?: number;
	rateWindowStarted?: number;
	rateWindowCount?: number;
	ipKey?: string;
	lastServerMessageAt?: number;
	lastActivityAt?: number;
}

export type WebSocketSocket = SocketLike & { data: SocketData };

export interface WebSocketHandlers {
	open(socket: WebSocketSocket): void;
	message(socket: WebSocketSocket, raw: string | Buffer): void;
	close(socket: WebSocketSocket): void;
	drain?(socket: WebSocketSocket): void;
	health?(socket: SocketLike, now: number): void;
}

const send = (socket: SocketLike, message: ServerMessage): void => {
	sendServerMessage(socket, message);
};

export const createWebSocketHandlers = (
	manager: RoomManager,
	options: {
		readonly logger?: Logger;
		readonly connectionLimiter?: SlidingWindowRateLimiter;
		readonly roomCreationLimiter?: SlidingWindowRateLimiter;
		readonly now?: () => number;
		readonly accepting?: () => boolean;
	} = {},
): WebSocketHandlers => ({
	open: (socket) => manager.trackSocket(socket),
	drain: (socket) => notifySocketDrain(socket),
	health: (socket, now) => {
		const data = (socket as WebSocketSocket).data;
		const lastServerMessage =
			getLastSentAt(socket) ?? data.lastActivityAt ?? now;
		if (now - lastServerMessage > 15_000)
			socket.close(1001, 'Connection stale');
	},
	message: (socket, raw) => {
		let requestId: string | undefined;
		try {
			const now = options.now?.() ?? Date.now();
			socket.data.lastActivityAt = now;
			if (
				socket.data.rateWindowStarted === undefined ||
				now - socket.data.rateWindowStarted >= 1000
			) {
				socket.data.rateWindowStarted = now;
				socket.data.rateWindowCount = 0;
			}
			socket.data.rateWindowCount = (socket.data.rateWindowCount ?? 0) + 1;
			if (socket.data.rateWindowCount > 150) {
				options.logger?.warn('rate_limit_exceeded', { kind: 'messages' });
				send(socket, {
					type: 'error',
					code: 'RATE_LIMITED',
					message: errorMessage('RATE_LIMITED').message,
					recoverable: true,
				});
				socket.close(1008, 'Rate limited');
				return;
			}
			const decoded = decodeClientMessage(
				typeof raw === 'string' ? raw : raw.toString(),
			);
			if (!decoded.success) {
				options.logger?.warn('protocol_validation_failed', {
					code: decoded.code,
				});
				socket.data.invalidMessages = (socket.data.invalidMessages ?? 0) + 1;
				send(socket, {
					type: 'error',
					code: decoded.code,
					message: errorMessage(decoded.code).message,
					recoverable: decoded.code !== 'PROTOCOL_MISMATCH',
				});
				if (decoded.code === 'PROTOCOL_MISMATCH')
					socket.close(1002, 'Protocol mismatch');
				else if (socket.data.invalidMessages >= 3)
					socket.close(1003, 'Too many invalid messages');
				return;
			}
			const message = decoded.message;
			if (message.type === 'create_room' || message.type === 'join_room')
				requestId = message.requestId;
			if (!socket.data.hello) {
				if (message.type !== 'hello') {
					send(socket, {
						type: 'error',
						code: 'INVALID_MESSAGE',
						message: 'The first message must be hello.',
						recoverable: false,
					});
					socket.close(1002, 'Hello required');
					return;
				}
				socket.data.hello = true;
				socket.data.clientId = message.clientId;
				send(socket, {
					type: 'hello_ack',
					protocolVersion: PROTOCOL_VERSION,
					serverTime: Date.now(),
				});
				return;
			}
			if (options.accepting !== undefined && !options.accepting()) {
				send(socket, {
					type: 'error',
					code: 'INTERNAL_ERROR',
					message: 'Server is shutting down.',
					recoverable: false,
				});
				socket.close(1001, 'Server shutting down');
				return;
			}
			if (message.type === 'hello') {
				send(socket, {
					type: 'error',
					code: 'INVALID_MESSAGE',
					message: 'Hello has already been completed.',
					recoverable: false,
				});
				return;
			}
			dispatch(manager, socket, message, options);
		} catch (error) {
			options.logger?.error('websocket_dispatch_failed', {
				error: error instanceof Error ? error.message : 'unknown',
			});
			const code = roomErrorMessage(error) as ErrorCode;
			const details = errorMessage(code);
			send(socket, {
				type: 'error',
				...(requestId === undefined ? {} : { requestId }),
				code,
				message: details.message,
				recoverable: details.recoverable,
			});
		}
	},
	close: (socket) => {
		clearSocketSender(socket);
		manager.untrackSocket(socket);
		const session = socket.data.session;
		if (session?.connected) {
			options.logger?.info('player_disconnected', {
				playerId: session.playerId,
			});
			const room = manager.get(session.roomCode);
			if (room !== undefined)
				room.disconnect(session.playerId, Date.now(), socket);
		}
	},
});

const dispatch = (
	manager: RoomManager,
	socket: SocketLike & { data: SocketData },
	message: Exclude<ClientMessage, { type: 'hello' }>,
	options: NonNullable<Parameters<typeof createWebSocketHandlers>[1]>,
): void => {
	const session = socket.data.session;
	if (message.type === 'create_room') {
		if (
			options.roomCreationLimiter?.allow(socket.data.ipKey ?? 'unknown') ===
			false
		) {
			options.logger?.warn('rate_limit_exceeded', { kind: 'room_creation' });
			throw new Error('RATE_LIMITED');
		}
		if (session !== undefined) throw new Error('NOT_JOINED');
		const created = manager.createRoom(
			socket.data.clientId ?? '',
			message.displayName,
			socket,
			message.gameType,
		);
		options.logger?.info('room_created', { roomCode: created.room.code });
		socket.data.session = created.session;
		send(socket, {
			type: 'room_joined',
			requestId: message.requestId,
			roomCode: created.room.code,
			playerId: created.session.playerId,
			reconnectToken: created.session.reconnectToken,
			hostPlayerId: created.session.playerId,
		});
		created.room.notify();
		return;
	}
	if (message.type === 'join_room') {
		if (session !== undefined) throw new Error('NOT_JOINED');
		const joined = manager.joinRoom(
			message.roomCode,
			socket.data.clientId ?? '',
			message.displayName,
			socket,
			message.reconnectToken,
		);
		if (joined.error !== undefined) throw new Error(joined.error);
		if (joined.room === undefined || joined.session === undefined)
			throw new Error('INTERNAL_ERROR');
		options.logger?.info(
			message.reconnectToken === undefined
				? 'player_joined'
				: 'player_reconnected',
			{
				roomCode: joined.room.code,
				playerId: joined.session.playerId,
			},
		);
		socket.data.session = joined.session;
		send(socket, {
			type: 'room_joined',
			requestId: message.requestId,
			roomCode: joined.room.code,
			playerId: joined.session.playerId,
			reconnectToken: joined.session.reconnectToken,
			hostPlayerId: joined.room.snapshot().hostPlayerId,
		});
		joined.room.notify();
		return;
	}
	if (message.type === 'ping') {
		send(socket, {
			type: 'pong',
			nonce: message.nonce,
			clientTime: message.clientTime,
			serverTime: Date.now(),
		});
		return;
	}
	if (session === undefined) throw new Error('NOT_JOINED');
	const room = manager.get(session.roomCode);
	if (room === undefined) throw new Error('ROOM_NOT_FOUND');
	switch (message.type) {
		case 'set_ready':
			room.setReady(session.playerId, message.ready);
			break;
		case 'start_match':
			room.start(session.playerId);
			break;
		case 'add_computer':
			room.addComputer(session.playerId, message.difficulty);
			break;
		case 'remove_computer':
			room.removeComputer(session.playerId, message.playerId);
			break;
		case 'return_to_lobby':
			room.returnToLobby(session.playerId);
			break;
		case 'leave_room':
			room.leave(session.playerId);
			delete socket.data.session;
			socket.close(1000, 'Left room');
			break;
		case 'input':
			room.acceptInput(session.playerId, message, Date.now());
			break;
	}
};
