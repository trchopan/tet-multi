import {
	applyInput,
	advanceTicks,
	createEngineState,
	TICK_MS,
	type GameEngineState,
} from '../../games/falling-blocks';
import type { InputAction } from '../../shared/types';

const createLocalSeed = (): string =>
	globalThis.crypto?.randomUUID?.() ?? 'tet-multi-local-seed';

export class LocalGameSession {
	public state = $state<GameEngineState>(createEngineState(createLocalSeed()));
	private accumulatorMs = 0;
	private previousFrameMs: number | undefined;

	public apply(action: InputAction): void {
		if (!this.state.gameOver) applyInput(this.state, action);
	}

	public advanceFrame(nowMs: number): void {
		if (this.previousFrameMs === undefined) {
			this.previousFrameMs = nowMs;
			return;
		}
		const elapsedMs = Math.min(Math.max(0, nowMs - this.previousFrameMs), 250);
		this.previousFrameMs = nowMs;
		this.accumulatorMs += elapsedMs;
		while (this.accumulatorMs >= TICK_MS) {
			advanceTicks(this.state, 1);
			this.accumulatorMs -= TICK_MS;
		}
	}

	public reset(): void {
		this.state = createEngineState(createLocalSeed());
		this.accumulatorMs = 0;
		this.previousFrameMs = undefined;
	}

	public dispose(): void {
		this.accumulatorMs = 0;
		this.previousFrameMs = undefined;
	}
}
