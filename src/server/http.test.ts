import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createHttpHandler } from './http';

const root = join(import.meta.dir, '.test-static');
const handler = createHttpHandler(root);

beforeAll(async () => {
	await mkdir(join(root, 'assets'), { recursive: true });
	await Bun.write(
		join(root, 'index.html'),
		'<!doctype html><main>tet-multi</main>',
	);
	await Bun.write(join(root, 'assets', 'app.js'), 'console.log("ready");');
});

afterAll(async () => {
	await rm(root, { recursive: true, force: true });
});

const request = (path: string, init?: RequestInit): Promise<Response> =>
	handler(new Request(`http://localhost${path}`, init));

describe('HTTP foundation', () => {
	test('returns a cache-disabled health response', async () => {
		const response = await request('/health');

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: 'ok' });
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(response.headers.get('content-type')).toContain('application/json');
	});

	test('serves static assets with immutable caching', async () => {
		const response = await request('/assets/app.js');

		expect(response.status).toBe(200);
		expect(await response.text()).toContain('ready');
		expect(response.headers.get('cache-control')).toBe(
			'public, max-age=31536000, immutable',
		);
		expect(response.headers.get('content-type')).toContain('text/javascript');
	});

	test('serves the SPA fallback for client-side routes', async () => {
		const response = await request('/room/ABC123');

		expect(response.status).toBe(200);
		expect(await response.text()).toContain('tet-multi');
		expect(response.headers.get('cache-control')).toBe('no-cache');
	});

	test('does not turn missing assets into SPA routes', async () => {
		const response = await request('/assets/missing.js');

		expect(response.status).toBe(404);
	});

	test('serves the root document', async () => {
		const response = await request('/');

		expect(response.status).toBe(200);
		expect(await response.text()).toContain('tet-multi');
	});

	test('rejects malformed paths without a server error', async () => {
		const response = await request('/%00');

		expect(response.status).toBe(404);
	});

	test('keeps the WebSocket boundary separate until its milestone', async () => {
		const response = await request('/ws');

		expect(response.status).toBe(426);
	});

	test('rejects non-GET requests', async () => {
		const response = await request('/health', { method: 'POST' });

		expect(response.status).toBe(405);
		expect(response.headers.get('allow')).toBe('GET');
	});
});
