import { describe, expect, test } from 'bun:test';
import { isAllowedOrigin } from './origin';

describe('WebSocket origin policy', () => {
	test('allows configured origins and rejects unknown production origins', () => {
		const allowed = new Set(['https://game.example']);
		expect(isAllowedOrigin('https://game.example', allowed, true)).toBe(true);
		expect(isAllowedOrigin('https://evil.example', allowed, true)).toBe(false);
		expect(isAllowedOrigin(null, allowed, true)).toBe(false);
	});

	test('allows local development origins', () => {
		expect(isAllowedOrigin('http://localhost:5173', new Set(), false)).toBe(
			true,
		);
		expect(isAllowedOrigin('http://192.168.1.10:5173', new Set(), false)).toBe(
			true,
		);
	});
});
