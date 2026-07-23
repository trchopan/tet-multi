import { describe, expect, test } from 'bun:test';
import { loadConfig } from './config';

describe('server configuration', () => {
	test('loads validated defaults and normalized origins', () => {
		const config = loadConfig({
			NODE_ENV: 'production',
			PORT: '4000',
			ALLOWED_ORIGINS: 'https://game.example/ ',
		});
		expect(config.port).toBe(4000);
		expect(config.allowedOrigins.has('https://game.example')).toBe(true);
		expect(config.production).toBe(true);
	});

	test('fails fast for invalid values', () => {
		expect(() => loadConfig({ PORT: '0' })).toThrow('PORT');
		expect(() => loadConfig({ LOG_LEVEL: 'trace' })).toThrow('LOG_LEVEL');
		expect(() => loadConfig({ ALLOWED_ORIGINS: 'not-an-origin' })).toThrow(
			'ALLOWED_ORIGINS',
		);
		expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(
			'ALLOWED_ORIGINS',
		);
	});
});
