import type { RoomManager } from './room-manager';
import type { Logger } from './logger';

export interface ShutdownController {
	readonly isAccepting: () => boolean;
	readonly shutdown: () => Promise<void>;
}

export const createShutdownController = (
	server: { stop(): void | Promise<void> },
	manager: RoomManager,
	stopScheduler: () => void,
	logger: Logger,
	timeoutMs: number,
): ShutdownController => {
	let accepting = true;
	let shuttingDown: Promise<void> | undefined;
	return {
		isAccepting: () => accepting,
		shutdown: async () => {
			if (shuttingDown !== undefined) return shuttingDown;
			accepting = false;
			manager.stopAccepting();
			shuttingDown = (async () => {
				stopScheduler();
				for (const socket of manager.sockets)
					socket.close(1001, 'Server shutting down');
				let timer: ReturnType<typeof setTimeout> | undefined;
				await Promise.race([
					Promise.resolve(server.stop()),
					new Promise<void>((resolve) => {
						timer = setTimeout(resolve, timeoutMs);
					}),
				]);
				if (timer !== undefined) clearTimeout(timer);
				logger.info('server_stopped', {});
			})();
			return shuttingDown;
		},
	};
};
