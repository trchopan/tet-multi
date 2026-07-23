export interface RateLimiterOptions {
	readonly limit: number;
	readonly windowMs: number;
	readonly now?: () => number;
}

export class SlidingWindowRateLimiter {
	private readonly entries = new Map<string, number[]>();
	private readonly now: () => number;
	private readonly limit: number;
	private readonly windowMs: number;

	constructor(options: RateLimiterOptions) {
		this.now = options.now ?? Date.now;
		this.limit = options.limit;
		this.windowMs = options.windowMs;
	}

	allow(key: string, now = this.now()): boolean {
		const threshold = now - this.windowMs;
		const recent = (this.entries.get(key) ?? []).filter(
			(timestamp) => timestamp > threshold,
		);
		if (recent.length >= this.limit) {
			this.entries.set(key, recent);
			return false;
		}
		recent.push(now);
		this.entries.set(key, recent);
		return true;
	}

	clear(): void {
		this.entries.clear();
	}
}
