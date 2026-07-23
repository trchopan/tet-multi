import { describe, expect, test } from 'bun:test';
import { ROOM_CODE_ALPHABET } from '../shared/constants';
import { Room } from './room';
import { RoomManager } from './room-manager';
import type { SocketLike } from './session';

class FakeSocket implements SocketLike {
	messages: string[] = [];
	closed = false;
	send(data: string): void {
		this.messages.push(data);
	}
	close(): void {
		this.closed = true;
	}
}

const logger = { info: (): void => undefined, warn: (): void => undefined };
const ids = (() => {
	let value = 0;
	return (): string => `id-${++value}`;
})();

describe('room lifecycle', () => {
	test('creates six sessions and rejects a seventh', () => {
		const manager = new RoomManager({
			randomBytes: () => Uint8Array.from([0, 1, 2, 3, 4, 5]),
			createId: ids,
			createToken: ids,
			logger,
		});
		const sockets = Array.from({ length: 7 }, () => new FakeSocket());
		const created = manager.createRoom('client-0', 'Player 0', sockets[0]!);
		for (let index = 1; index < 6; index += 1)
			expect(
				manager.joinRoom(
					created.room.code,
					`client-${index}`,
					`Player ${index}`,
					sockets[index]!,
				).session,
			).toBeDefined();
		const rejected = manager.joinRoom(
			created.room.code,
			'client-6',
			'Player 6',
			sockets[6]!,
		);
		expect(rejected.error).toBe('ROOM_FULL');
		expect(created.room.playerCount).toBe(6);
	});

	test('requires readiness and host authorization before countdown', () => {
		let now = 0;
		const room = new Room({
			code: ROOM_CODE_ALPHABET.slice(0, 6),
			now: () => now,
			createId: ids,
			createToken: ids,
		});
		const first = room.join('a', 'Alice', new FakeSocket(), 0).session!;
		const second = room.join('b', 'Bob', new FakeSocket(), 0).session!;
		expect(() => room.start(second.playerId)).toThrow('NOT_HOST');
		expect(() => room.start(first.playerId)).toThrow('NOT_READY');
		room.setReady(first.playerId, true);
		room.setReady(second.playerId, true);
		room.start(first.playerId, now);
		expect(room.currentPhase).toBe('countdown');
		now = 3000;
		room.update(now);
		expect(room.currentPhase).toBe('playing');
		expect(() => room.returnToLobby(second.playerId)).toThrow('NOT_HOST');
		room.returnToLobby(first.playerId);
		expect(room.currentPhase).toBe('lobby');
	});

	test('migrates host on explicit leave and broadcasts expiry removals', () => {
		let now = 0;
		const room = new Room({
			code: 'ABC234',
			now: () => now,
			reconnectGraceMs: 20,
			createId: ids,
			createToken: ids,
		});
		const hostSocket = new FakeSocket();
		const nextSocket = new FakeSocket();
		const host = room.join('a', 'Alice', hostSocket, 0).session!;
		const next = room.join('b', 'Bob', nextSocket, 1).session!;
		room.leave(host.playerId);
		expect(room.snapshot().hostPlayerId).toBe(next.playerId);
		room.disconnect(next.playerId, 10, nextSocket);
		now = 30;
		room.update(now);
		expect(room.playerCount).toBe(0);
		expect(JSON.parse(nextSocket.messages.at(-1) ?? '{}').type).toBe(
			'room_snapshot',
		);
	});

	test('removes an empty room after its cleanup TTL', () => {
		let now = 0;
		const manager = new RoomManager({
			now: () => now,
			createId: ids,
			createToken: ids,
			logger,
		});
		const created = manager.createRoom('a', 'Alice', new FakeSocket());
		created.room.leave(created.session.playerId);
		now = 300_000;
		manager.fixedUpdate();
		expect(manager.roomCount).toBe(0);
	});
});
