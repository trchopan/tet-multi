import { performance } from 'node:perf_hooks';
import { Room } from '../src/server/room';
import { MAX_PLAYERS_PER_ROOM } from '../src/shared/constants';
import type { SocketLike } from '../src/server/session';

const ROOM_COUNT = 50;
const PLAYERS_PER_ROOM = MAX_PLAYERS_PER_ROOM;
const TICKS = 600;

class BenchmarkSocket implements SocketLike {
	bytes = 0;
	send(data: string): void {
		this.bytes += Buffer.byteLength(data);
	}
	close(): void {}
}

const rooms: Array<{ room: Room; sockets: BenchmarkSocket[] }> = [];
for (let roomIndex = 0; roomIndex < ROOM_COUNT; roomIndex += 1) {
	let id = 0;
	const room = new Room({
		code: `AAA23${(roomIndex % 8) + 2}`,
		createId: () => `room-${roomIndex}-id-${++id}`,
		createSeed: () => `seed-${roomIndex}`,
		createToken: () => `token-${roomIndex}-${id}`,
	});
	const sockets: BenchmarkSocket[] = [];
	for (let playerIndex = 0; playerIndex < PLAYERS_PER_ROOM; playerIndex += 1) {
		const socket = new BenchmarkSocket();
		sockets.push(socket);
		room.join(`client-${playerIndex}`, `Player ${playerIndex}`, socket, 0);
	}
	for (const player of room.players) room.setReady(player.playerId, true);
	room.start(room.players[0]!.playerId, 0);
	room.update(3000);
	for (const socket of sockets) socket.bytes = 0;
	rooms.push({ room, sockets });
}

const start = performance.now();
let largestSnapshot = 0;
let largestGlobalTickMs = 0;
let totalSnapshotBytes = 0;
for (let tick = 1; tick <= TICKS; tick += 1) {
	const now = 3000 + tick * (1000 / 60);
	const tickStart = performance.now();
	for (const { room, sockets } of rooms) {
		room.update(now);
		if (tick % 3 === 0) {
			const snapshotBytes = Buffer.byteLength(
				JSON.stringify(room.snapshot(now)),
			);
			largestSnapshot = Math.max(largestSnapshot, snapshotBytes);
		}
		for (const socket of sockets) totalSnapshotBytes += socket.bytes;
		for (const socket of sockets) socket.bytes = 0;
	}
	largestGlobalTickMs = Math.max(
		largestGlobalTickMs,
		performance.now() - tickStart,
	);
}
const elapsed = performance.now() - start;
const averageGlobalTickMs = elapsed / TICKS;
const trafficPerRoomPerSecond = totalSnapshotBytes / ROOM_COUNT / (TICKS / 60);
const result = {
	rooms: ROOM_COUNT,
	playersPerRoom: PLAYERS_PER_ROOM,
	ticksPerRoom: TICKS,
	elapsedMs: Number(elapsed.toFixed(2)),
	averageGlobalTickMs: Number(averageGlobalTickMs.toFixed(4)),
	largestGlobalTickMs: Number(largestGlobalTickMs.toFixed(4)),
	largestSnapshotBytes: largestSnapshot,
	averageOutboundBytesPerRoomPerSecond: Number(
		trafficPerRoomPerSecond.toFixed(2),
	),
};
console.log(JSON.stringify(result, null, 2));
if (averageGlobalTickMs >= 8)
	console.warn('Warning: average global tick work exceeded 8 ms');
if (largestSnapshot >= 20 * 1024)
	throw new Error('Six-player snapshot exceeded 20 KiB');
if (trafficPerRoomPerSecond >= 400 * 1024)
	console.warn(
		'Warning: aggregate outbound traffic exceeded 400 KiB/s per room',
	);
