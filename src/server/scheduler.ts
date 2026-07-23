import { TICK_MS } from '../shared/constants';

export interface FixedUpdateTarget {
	fixedUpdate(now: number): void;
}

export interface FixedSchedulerOptions {
	readonly now?: () => number;
	readonly maxElapsedMs?: number;
}

export class FixedScheduler {
	private readonly now: () => number;
	private readonly maxElapsedMs: number;
	private previous: number;
	private accumulator = 0;

	constructor(options: FixedSchedulerOptions = {}) {
		this.now = options.now ?? Date.now;
		this.maxElapsedMs = options.maxElapsedMs ?? 250;
		this.previous = this.now();
	}

	advance(manager: FixedUpdateTarget, now = this.now()): number {
		this.accumulator += Math.min(
			Math.max(0, now - this.previous),
			this.maxElapsedMs,
		);
		this.previous = now;
		let ticks = 0;
		while (this.accumulator >= TICK_MS) {
			manager.fixedUpdate(now);
			this.accumulator -= TICK_MS;
			ticks += 1;
		}
		return ticks;
	}
}
