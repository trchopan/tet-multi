import { resolve } from 'node:path';
import { createHttpHandler } from './http.js';
import { RoomManager } from './room-manager.js';
import { createWebSocketHandlers, type SocketData } from './websocket.js';
import { isAllowedOrigin } from './origin.js';

const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const host = process.env.HOST ?? '0.0.0.0';
const staticRoot = resolve(process.env.STATIC_ROOT ?? 'build');
const production = (process.env.NODE_ENV ?? 'development') === 'production';
const configuredOrigins = (
	process.env.ALLOWED_ORIGINS ??
	`http://localhost:${port},http://127.0.0.1:${port}`
)
	.split(',')
	.map((origin) => origin.trim())
	.filter((origin) => origin.length > 0);
const allowedOrigins = new Set(configuredOrigins);
const roomManager = new RoomManager();
const websocket = createWebSocketHandlers(roomManager);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
	throw new Error('PORT must be an integer between 1 and 65535');
}

const server = Bun.serve({
	fetch: (request, currentServer) => {
		if (
			new URL(request.url).pathname === '/ws' &&
			request.headers.get('upgrade')?.toLowerCase() === 'websocket'
		) {
			if (
				!isAllowedOrigin(
					request.headers.get('origin'),
					allowedOrigins,
					production,
				)
			)
				return new Response('Origin not allowed', { status: 403 });
			const upgraded = currentServer.upgrade(request, {
				data: { hello: false } satisfies SocketData,
			});
			return upgraded
				? undefined
				: new Response('WebSocket upgrade failed', { status: 400 });
		}
		return createHttpHandler(staticRoot)(request);
	},
	hostname: host,
	port,
	websocket,
});

setInterval(() => roomManager.fixedUpdate(), 1000 / 60);

console.log(`Neon Drop server listening on ${server.url}`);
