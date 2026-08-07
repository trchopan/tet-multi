import { describe, expect, test } from 'bun:test';
import { gameRegistry } from '$/games/registry';
import '$/games/falling-blocks';
import '$/games/snake';

describe('Game Plugin Registry', () => {
	test('registers and retrieves Falling Blocks and Snake plugins', () => {
		expect(gameRegistry.has('falling-blocks')).toBe(true);
		expect(gameRegistry.has('snake')).toBe(true);

		const fallingBlocks = gameRegistry.get('falling-blocks');
		expect(fallingBlocks.name).toBe('Falling Blocks');
		expect(fallingBlocks.viewMode).toBe('per-player-card');

		const snake = gameRegistry.get('snake');
		expect(snake.name).toBe('Snake Arena');
		expect(snake.viewMode).toBe('shared-canvas');
	});

	test('returns list of all registered plugins', () => {
		const all = gameRegistry.getAll();
		expect(all.length).toBeGreaterThanOrEqual(2);
		expect(all.map((p) => p.id)).toContain('falling-blocks');
		expect(all.map((p) => p.id)).toContain('snake');
	});

	test('throws on unregistered plugin id', () => {
		expect(() => gameRegistry.get('invalid_game_id')).toThrow();
	});
});
