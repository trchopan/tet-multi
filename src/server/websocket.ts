import { decodeClientMessage, encodeServerMessage } from '../shared/protocol';
import type { ClientMessage, ErrorCode, ServerMessage } from '../shared/types';
import { errorMessage, roomErrorMessage, RoomManager } from './room-manager';
import type { Session, SocketLike } from './session';

export interface SocketData {
	hello: boolean;
	clientId?: string;
	session?: Session;
	invalidMessages?: number;
	rateWindowStarted?: number;
	rateWindowCount?: number;
}

export interface WebSocketHandlers {
	open(socket: SocketLike & { data: SocketData }): void;
	message(
		socket: SocketLike & { data: SocketData },
		raw: string | Buffer,
	): void;
	close(socket: SocketLike & { data: SocketData }): void;
}

const send = (socket: SocketLike, message: ServerMessage): void => {
	socket.send(encodeServerMessage(message));
};

export const createWebSocketHandlers = (
	manager: RoomManager,
): WebSocketHandlers => ({
	open: () => undefined,
	message: (socket, raw) => {
		let requestId: string | undefined;
		try {
			const now = Date.now();
			if (
				socket.data.rateWindowStarted === undefined ||
				now - socket.data.rateWindowStarted >= 1000
			) {
				socket.data.rateWindowStarted = now;
				socket.data.rateWindowCount = 0;
			}
			socket.data.rateWindowCount = (socket.data.rateWindowCount ?? 0) + 1;
			if (socket.data.rateWindowCount > 150) {
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
					protocolVersion: 1,
					serverTime: Date.now(),
				});
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
			dispatch(manager, socket, message);
		} catch (error) {
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
		const session = socket.data.session;
		if (session?.connected) {
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
): void => {
	const session = socket.data.session;
	if (message.type === 'create_room') {
		if (session !== undefined) throw new Error('NOT_JOINED');
		const created = manager.createRoom(
			socket.data.clientId ?? '',
			message.displayName,
			socket,
		);
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
		case 'return_to_lobby':
			room.returnToLobby(session.playerId);
			break;
		case 'leave_room':
			room.leave(session.playerId);
			delete socket.data.session;
			socket.close(1000, 'Left room');
			break;
		case 'input':
			room.acceptInput(session.playerId, message);
			break;
	}
};
