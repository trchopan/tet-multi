import { describe, expect, test } from 'bun:test';
import { RoomManager } from './room-manager';
import { createShutdownController } from './shutdown';
import type { SocketLike } from './session';
import type { Logger } from './logger';

class FakeSocket implements SocketLike {
	closed = false;
	send(): number {
		return 1;
	}
	close(): void {
		this.closed = true;
	}
}

const logger: Logger = {
	debug: () => undefined,
	info: () => undefined,
	warn: () => undefined,
	error: () => undefined,
};

describe('server shutdown', () => {
	test('stops admission, scheduler work, and active sockets', async () => {
		const socket = new FakeSocket();
		const manager = new RoomManager({
			randomBytes: () => Uint8Array.from([1, 2, 3, 4, 5, 6]),
			logger,
		});
		manager.createRoom('client', 'Alice', socket);
		let stopped = false;
		let serverStopped = false;
		const controller = createShutdownController(
			{
				stop: () => {
					serverStopped = true;
				},
			},
			manager,
			() => {
				stopped = true;
			},
			logger,
			10,
		);

		await controller.shutdown();
		expect(controller.isAccepting()).toBe(false);
		expect(stopped).toBe(true);
		expect(serverStopped).toBe(true);
		expect(socket.closed).toBe(true);
		expect(() => manager.createRoom('other', 'Bob', new FakeSocket())).toThrow(
			'INTERNAL_ERROR',
		);
	});

	test('also closes sockets that have not joined a room', async () => {
		const socket = new FakeSocket();
		const manager = new RoomManager({ logger });
		manager.trackSocket(socket);
		const controller = createShutdownController(
			{ stop: () => undefined },
			manager,
			() => undefined,
			logger,
			10,
		);
		await controller.shutdown();
		expect(socket.closed).toBe(true);
	});
});
