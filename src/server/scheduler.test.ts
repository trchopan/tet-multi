import { describe, expect, test } from 'bun:test';
import { TICK_MS } from '$/shared/constants';
import { FixedScheduler } from './scheduler';

describe('fixed simulation scheduler', () => {
	test('clamps elapsed time and advances whole fixed ticks', () => {
		let now = 0;
		const scheduler = new FixedScheduler({ now: () => now });
		let updates = 0;
		const manager = {
			fixedUpdate: (): void => {
				updates += 1;
			},
		};

		now = 1000;
		expect(scheduler.advance(manager)).toBe(15);
		expect(updates).toBe(15);
	});

	test('does not advance on a partial tick', () => {
		let now = 0;
		const scheduler = new FixedScheduler({ now: () => now });
		let updates = 0;
		const manager = {
			fixedUpdate: (): void => {
				updates += 1;
			},
		};

		now = TICK_MS / 2;
		expect(scheduler.advance(manager)).toBe(0);
		expect(updates).toBe(0);
	});

	test('reports bounded scheduler diagnostics', () => {
		let now = 0;
		const diagnostics: number[] = [];
		const scheduler = new FixedScheduler({
			now: () => now,
			onDiagnostics: (value) => diagnostics.push(value.lagMs),
		});
		scheduler.advance({ fixedUpdate: () => undefined }, 1000);
		expect(diagnostics[0]).toBeLessThanOrEqual(250);
	});
});
