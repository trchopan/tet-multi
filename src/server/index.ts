import { resolve } from 'node:path';
import { createHttpHandler } from './http.js';

const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const host = process.env.HOST ?? '0.0.0.0';
const staticRoot = resolve(process.env.STATIC_ROOT ?? 'build');

if (!Number.isInteger(port) || port < 1 || port > 65535) {
	throw new Error('PORT must be an integer between 1 and 65535');
}

const server = Bun.serve({
	fetch: createHttpHandler(staticRoot),
	hostname: host,
	port,
});

console.log(`Neon Drop server listening on ${server.url}`);
