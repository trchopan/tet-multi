import { describe, expect, test } from 'bun:test';
import { RoomManager } from './room-manager';
import { createWebSocketHandlers, type SocketData } from './websocket';
import type { SocketLike } from './session';

class FakeSocket implements SocketLike {
	data: SocketData = { hello: false };
	messages: string[] = [];
	closeCode = 0;
	send(data: string): void {
		this.messages.push(data);
	}
	close(code?: number): void {
		if (code !== undefined) this.closeCode = code;
	}
}

describe('WebSocket lobby boundary', () => {
	test('requires hello and acknowledges a valid handshake', () => {
		const manager = new RoomManager({
			logger: { info: () => undefined, warn: () => undefined },
		});
		const handlers = createWebSocketHandlers(manager);
		const socket = new FakeSocket();
		handlers.message(
			socket,
			JSON.stringify({
				type: 'create_room',
				requestId: 'r',
				displayName: 'Alice',
			}),
		);
		expect(socket.closeCode).toBe(1002);
		const second = new FakeSocket();
		handlers.message(
			second,
			JSON.stringify({
				type: 'hello',
				protocolVersion: 2,
				clientId: 'client-a',
			}),
		);
		expect(JSON.parse(second.messages[0]!).type).toBe('hello_ack');
	});

	test('returns request-correlated errors and closes after repeated malformed messages', () => {
		const manager = new RoomManager({
			logger: { info: () => undefined, warn: () => undefined },
		});
		const handlers = createWebSocketHandlers(manager);
		const socket = new FakeSocket();
		handlers.message(
			socket,
			JSON.stringify({
				type: 'hello',
				protocolVersion: 2,
				clientId: 'client-a',
			}),
		);
		handlers.message(
			socket,
			JSON.stringify({
				type: 'join_room',
				requestId: 'missing',
				roomCode: 'ABC234',
				displayName: 'Alice',
			}),
		);
		const error = JSON.parse(socket.messages.at(-1)!);
		expect(error).toMatchObject({
			type: 'error',
			requestId: 'missing',
			code: 'ROOM_NOT_FOUND',
		});
		handlers.message(socket, '{');
		handlers.message(socket, '{');
		handlers.message(socket, '{');
		expect(socket.closeCode).toBe(1003);
	});

	test('does not let an old socket disconnect its replacement', () => {
		const manager = new RoomManager({
			logger: { info: () => undefined, warn: () => undefined },
		});
		const handlers = createWebSocketHandlers(manager);
		const first = new FakeSocket();
		handlers.message(
			first,
			JSON.stringify({
				type: 'hello',
				protocolVersion: 2,
				clientId: 'client-a',
			}),
		);
		handlers.message(
			first,
			JSON.stringify({
				type: 'create_room',
				requestId: 'r',
				displayName: 'Alice',
			}),
		);
		const token = JSON.parse(first.messages.at(-2)!).reconnectToken;
		const roomCode = JSON.parse(first.messages.at(-2)!).roomCode;
		const replacement = new FakeSocket();
		handlers.message(
			replacement,
			JSON.stringify({
				type: 'hello',
				protocolVersion: 2,
				clientId: 'client-a',
			}),
		);
		handlers.message(
			replacement,
			JSON.stringify({
				type: 'join_room',
				requestId: 'r2',
				roomCode,
				displayName: 'Alice',
				reconnectToken: token,
			}),
		);
		handlers.close(first);
		expect(manager.get(roomCode)?.players[0]?.connected).toBe(true);
	});

	test('closes stale sockets during health checks', () => {
		const manager = new RoomManager({
			logger: { info: () => undefined, warn: () => undefined },
		});
		const handlers = createWebSocketHandlers(manager, { now: () => 0 });
		const socket = new FakeSocket();
		handlers.open(socket);
		socket.data.lastActivityAt = 0;
		handlers.health?.(socket, 15_001);
		expect(socket.closeCode).toBe(1001);
	});
});
