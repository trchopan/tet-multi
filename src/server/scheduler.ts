import { TICK_MS } from '$/shared/constants';

export interface FixedUpdateTarget {
	fixedUpdate(now: number): void;
}

export interface FixedSchedulerOptions {
	readonly now?: () => number;
	readonly maxElapsedMs?: number;
	readonly onDiagnostics?: (diagnostics: SchedulerDiagnostics) => void;
}

export interface SchedulerDiagnostics {
	readonly elapsedMs: number;
	readonly ticks: number;
	readonly lagMs: number;
}

export class FixedScheduler {
	private readonly now: () => number;
	private readonly maxElapsedMs: number;
	private previous: number;
	private accumulator = 0;
	private readonly onDiagnostics:
		((diagnostics: SchedulerDiagnostics) => void) | undefined;
	private running = true;

	constructor(options: FixedSchedulerOptions = {}) {
		this.now = options.now ?? Date.now;
		this.maxElapsedMs = options.maxElapsedMs ?? 250;
		this.previous = this.now();
		this.onDiagnostics = options.onDiagnostics;
	}

	advance(manager: FixedUpdateTarget, now = this.now()): number {
		if (!this.running) return 0;
		const elapsedMs = Math.max(0, now - this.previous);
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
		this.onDiagnostics?.({ elapsedMs, ticks, lagMs: this.accumulator });
		return ticks;
	}

	stop(): void {
		this.running = false;
	}
}
