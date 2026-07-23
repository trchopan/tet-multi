import { describe, expect, test } from 'bun:test';
import { SlidingWindowRateLimiter } from './rate-limit';

describe('sliding-window rate limiter', () => {
	test('limits a key and expires entries by injected time', () => {
		let now = 0;
		const limiter = new SlidingWindowRateLimiter({
			limit: 2,
			windowMs: 1000,
			now: () => now,
		});
		expect(limiter.allow('client')).toBe(true);
		expect(limiter.allow('client')).toBe(true);
		expect(limiter.allow('client')).toBe(false);
		now = 1001;
		expect(limiter.allow('client')).toBe(true);
		expect(limiter.allow('other')).toBe(true);
	});
});
