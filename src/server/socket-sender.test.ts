import { describe, expect, test } from 'bun:test';
import { notifySocketDrain, sendServerMessage } from './socket-sender';
import type { SocketLike } from './session';

class FakeSocket implements SocketLike {
	messages: string[] = [];
	result = 1;
	closed = false;
	send(data: string): number {
		if (this.result === 0) return 0;
		this.messages.push(data);
		return this.result;
	}
	close(): void {
		this.closed = true;
	}
}

const snapshot = (serverTick: number) => ({
	type: 'room_snapshot' as const,
	snapshot: {
		protocolVersion: 2 as const,
		roomCode: 'ABC234',
		phase: 'lobby' as const,
		hostPlayerId: 'player',
		serverTick,
		serverTime: 0,
		players: [],
	},
});

describe('bounded socket sender', () => {
	test('replaces pending snapshots and flushes the newest after drain', () => {
		const socket = new FakeSocket();
		socket.result = 0;
		sendServerMessage(socket, snapshot(1), true);
		sendServerMessage(socket, snapshot(2), true);
		socket.result = 1;
		notifySocketDrain(socket);
		expect(socket.messages).toHaveLength(1);
		expect(JSON.parse(socket.messages[0]!).snapshot.serverTick).toBe(2);
	});

	test('preserves critical messages ahead of replaceable snapshots', () => {
		const socket = new FakeSocket();
		socket.result = 0;
		sendServerMessage(socket, snapshot(1), true);
		sendServerMessage(socket, {
			type: 'error',
			code: 'RATE_LIMITED',
			message: 'Too many requests.',
			recoverable: true,
		});
		socket.result = 1;
		notifySocketDrain(socket);
		expect(JSON.parse(socket.messages[0]!).type).toBe('error');
	});

	test('does not replace a critical snapshot with a later normal snapshot', () => {
		const socket = new FakeSocket();
		socket.result = 0;
		sendServerMessage(socket, snapshot(1), false);
		sendServerMessage(socket, snapshot(2), true);
		socket.result = 1;
		notifySocketDrain(socket);
		expect(JSON.parse(socket.messages[0]!).snapshot.serverTick).toBe(1);
	});
});
