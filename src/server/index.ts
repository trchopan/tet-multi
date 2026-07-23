import { createHttpHandler } from './http.js';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { RoomManager } from './room-manager.js';
import { createWebSocketHandlers, type SocketData } from './websocket.js';
import { isAllowedOrigin } from './origin.js';
import { FixedScheduler } from './scheduler.js';
import { SlidingWindowRateLimiter } from './rate-limit.js';
import { createShutdownController } from './shutdown.js';

const config = loadConfig();
const logger = createLogger(config.logLevel, config.production);
const roomManager = new RoomManager({
	logger,
	emptyTtlMs: config.roomEmptyTtlMs,
	reconnectGraceMs: config.reconnectGraceMs,
});
const connectionLimiter = new SlidingWindowRateLimiter({
	limit: config.connectionLimit,
	windowMs: 60_000,
});
const roomCreationLimiter = new SlidingWindowRateLimiter({
	limit: config.roomCreationLimit,
	windowMs: 60_000,
});
const scheduler = new FixedScheduler({
	onDiagnostics: (diagnostics) => {
		if (diagnostics.lagMs > 100)
			logger.warn('scheduler_lag', {
				lagMs: diagnostics.lagMs,
				ticks: diagnostics.ticks,
			});
	},
});
let interval: ReturnType<typeof setInterval> | undefined;
let healthInterval: ReturnType<typeof setInterval> | undefined;
let shutdown: ReturnType<typeof createShutdownController>;

const websocket = createWebSocketHandlers(roomManager, {
	logger,
	connectionLimiter,
	roomCreationLimiter,
	accepting: () => shutdown.isAccepting(),
});

const server = Bun.serve({
	fetch: (request, currentServer) => {
		if (
			new URL(request.url).pathname === '/ws' &&
			request.headers.get('upgrade')?.toLowerCase() === 'websocket'
		) {
			if (
				!isAllowedOrigin(
					request.headers.get('origin'),
					config.allowedOrigins,
					config.production,
				)
			)
				return new Response('Origin not allowed', { status: 403 });
			const ip = currentServer.requestIP(request)?.address ?? 'unknown';
			if (!connectionLimiter.allow(ip))
				return new Response('Too many connections', { status: 429 });
			const upgraded = currentServer.upgrade(request, {
				data: { hello: false, ipKey: ip } satisfies SocketData,
			});
			return upgraded
				? undefined
				: new Response('WebSocket upgrade failed', { status: 400 });
		}
		return createHttpHandler(config.staticRoot)(request);
	},
	hostname: config.host,
	port: config.port,
	websocket: { ...websocket, idleTimeout: config.websocketIdleTimeoutSeconds },
});

shutdown = createShutdownController(
	server,
	roomManager,
	() => {
		scheduler.stop();
		if (interval !== undefined) clearInterval(interval);
		if (healthInterval !== undefined) clearInterval(healthInterval);
	},
	logger,
	config.shutdownTimeoutMs,
);
interval = setInterval(() => scheduler.advance(roomManager), 1000 / 60);
healthInterval = setInterval(() => {
	for (const socket of roomManager.sockets)
		websocket.health?.(socket, Date.now());
}, 5_000);
logger.info('server_started', { port: config.port, host: config.host });

const stop = (): void => {
	void shutdown.shutdown();
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
