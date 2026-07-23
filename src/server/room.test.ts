import { describe, expect, test } from 'bun:test';
import { ROOM_CODE_ALPHABET } from '../shared/constants';
import { Room } from './room';
import { RoomManager } from './room-manager';
import type { SocketLike } from './session';
import { validateServerMessage } from '../shared/protocol';

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

	test('isolates a failed room update from the scheduler', () => {
		const manager = new RoomManager({
			randomBytes: () => Uint8Array.from([1, 2, 3, 4, 5, 6]),
			createId: ids,
			createToken: ids,
			logger,
		});
		const created = manager.createRoom('a', 'Alice', new FakeSocket());
		created.room.update = (): boolean => {
			throw new Error('corrupt room');
		};
		expect(() => manager.fixedUpdate()).not.toThrow();
		expect(manager.roomCount).toBe(0);
	});

	test('sends lobby heartbeat snapshots every five seconds', () => {
		let now = 0;
		const socket = new FakeSocket();
		const room = new Room({
			code: 'ABC234',
			now: () => now,
			createId: ids,
			createToken: ids,
		});
		room.join('a', 'Alice', socket, now);
		socket.messages = [];
		now = 4999;
		room.update(now);
		expect(socket.messages).toHaveLength(0);
		now = 5000;
		room.update(now);
		expect(JSON.parse(socket.messages[0] ?? '{}').type).toBe('room_snapshot');
	});

	test('runs authoritative engines and deduplicates input sequences', () => {
		const createRoom = (): Room => {
			let now = 0;
			const room = new Room({
				code: 'ABC234',
				now: () => now,
				createId: ids,
				createSeed: () => 'match-seed',
				createToken: ids,
			});
			const first = room.join('a', 'Alice', new FakeSocket(), 0).session!;
			const second = room.join('b', 'Bob', new FakeSocket(), 0).session!;
			room.setReady(first.playerId, true);
			room.setReady(second.playerId, true);
			room.start(first.playerId, now);
			now = 3000;
			room.update(now);
			return room;
		};

		const first = createRoom();
		const player = first.players[0]!;
		first.acceptInput(
			player.playerId,
			{
				type: 'input',
				matchId: first.snapshot().matchId!,
				sequence: 1,
				action: 'hard_drop',
			},
			0,
		);
		first.acceptInput(
			player.playerId,
			{
				type: 'input',
				matchId: first.snapshot().matchId!,
				sequence: 1,
				action: 'hard_drop',
			},
			0,
		);
		first.update(3017);
		const snapshot = first.snapshot(3017);
		const firstPlayer = snapshot.players[0]!;
		expect(firstPlayer.lastProcessedInput).toBe(1);
		expect(firstPlayer.board).toHaveLength(240);

		const second = createRoom();
		const secondPlayer = second.players[0]!;
		second.acceptInput(
			secondPlayer.playerId,
			{
				type: 'input',
				matchId: second.snapshot().matchId!,
				sequence: 1,
				action: 'hard_drop',
			},
			0,
		);
		second.update(3017);
		expect(second.snapshot(3017).players[0]?.board).toEqual(firstPlayer.board);
	});

	test('broadcasts normal gameplay snapshots at 20 Hz', () => {
		let now = 0;
		const room = new Room({
			code: 'ABC234',
			now: () => now,
			createId: ids,
			createSeed: () => 'snapshot-seed',
			createToken: ids,
		});
		const firstSocket = new FakeSocket();
		const secondSocket = new FakeSocket();
		const first = room.join('a', 'Alice', firstSocket, 0).session!;
		const second = room.join('b', 'Bob', secondSocket, 0).session!;
		room.setReady(first.playerId, true);
		room.setReady(second.playerId, true);
		room.start(first.playerId, now);
		firstSocket.messages = [];
		now = 3000;
		room.update(now);
		firstSocket.messages = [];
		room.update(3017);
		room.update(3034);
		room.update(3051);
		const snapshots = firstSocket.messages
			.map((message) => JSON.parse(message) as unknown)
			.filter(
				(message) =>
					typeof message === 'object' &&
					message !== null &&
					'type' in message &&
					message.type === 'room_snapshot',
			);
		expect(snapshots).toHaveLength(1);
		expect(validateServerMessage(snapshots[0])).toBe(true);
	});

	test('explicit leave eliminates a player during an active match', () => {
		let now = 0;
		const room = new Room({
			code: 'ABC234',
			now: () => now,
			createId: ids,
			createSeed: () => 'leave-seed',
			createToken: ids,
		});
		const first = room.join('a', 'Alice', new FakeSocket(), 0).session!;
		const second = room.join('b', 'Bob', new FakeSocket(), 0).session!;
		room.setReady(first.playerId, true);
		room.setReady(second.playerId, true);
		room.start(first.playerId, now);
		now = 3000;
		room.update(now);
		room.leave(first.playerId);
		const snapshot = room.snapshot(now);
		expect(room.currentPhase).toBe('finished');
		expect(snapshot.winnerPlayerIds).toEqual([second.playerId]);
	});

	test('simultaneous grace expiry produces one final draw decision', () => {
		let now = 0;
		const room = new Room({
			code: 'ABC234',
			now: () => now,
			reconnectGraceMs: 20,
			createId: ids,
			createSeed: () => 'expiry-seed',
			createToken: ids,
		});
		const sockets = [new FakeSocket(), new FakeSocket()];
		const players = sockets.map(
			(socket, index) =>
				room.join(`client-${index}`, `Player ${index}`, socket, 0).session!,
		);
		for (const player of players) room.setReady(player.playerId, true);
		room.start(players[0]!.playerId, now);
		now = 3000;
		room.update(now);
		room.disconnect(players[0]!.playerId, 10, sockets[0]);
		room.disconnect(players[1]!.playerId, 10, sockets[1]);
		now = 30;
		room.update(now);
		const snapshot = room.snapshot(now);
		expect(room.currentPhase).toBe('finished');
		expect(snapshot.winnerPlayerIds).toEqual([]);
		expect(
			snapshot.players.filter((player) => player.placement === 2),
		).toHaveLength(2);
	});
});
