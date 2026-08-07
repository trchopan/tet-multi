import type {
	ComputerDifficulty,
	PlayerSnapshot,
	RoomSnapshot,
} from '$/shared/types';

export type ViewMode = 'per-player-card' | 'shared-canvas' | 'hybrid-table';

export interface GameControlBinding {
	readonly action: string;
	readonly label: string;
	readonly defaultKeys: readonly string[];
}

export interface PlayerInputEnvelope<TInput extends string = string> {
	readonly playerId: string;
	readonly sequence: number;
	readonly action: TInput;
}

export interface PlayerGameSummary {
	readonly playerId: string;
	readonly matchState: 'playing' | 'eliminated' | 'waiting' | 'disconnected';
	readonly score: number;
	readonly placement?: number | undefined;
	readonly eliminatedAtTick?: number | undefined;
	readonly customState?: unknown | undefined;
	readonly [key: string]: unknown;
}

export interface EngineInitPlayer {
	readonly playerId: string;
	readonly displayName: string;
	readonly playerType?: 'human' | 'computer' | undefined;
	readonly computerDifficulty?: ComputerDifficulty | undefined;
}

export interface EngineInitOptions<TConfig = unknown> {
	readonly matchId: string;
	readonly seed: string;
	readonly players: readonly EngineInitPlayer[];
	readonly config?: TConfig;
}

export interface GameEngine<
	TState = unknown,
	TInput extends string = string,
	TPrivateState = unknown,
> {
	/** Process fixed server tick step with queued inputs */
	tick(
		serverTick: number,
		inputs: readonly PlayerInputEnvelope<TInput>[],
	): void;

	/** Public snapshot payload for room state */
	getPublicSnapshot(): TState;

	/** Optional private snapshot payload for specific player socket */
	getPrivateSnapshot?(playerId: string): TPrivateState | undefined;

	/** Summary per player mapping to PlayerSnapshot fields */
	getPlayerSummaries(): Map<string, PlayerGameSummary>;

	/** Returns whether match has concluded */
	isFinished(): boolean;

	/** Player IDs of winner(s) */
	getWinners(): string[];

	/** Deterministic state hash for verification */
	getHash(): string;

	/** Optional hook to eliminate players when they explicitly leave or time out */
	eliminatePlayers?(playerIds: readonly string[]): void;

	/** Optional test hook to force a top-out */
	forceTestTopOut?(): void;
}

export interface RectBounds {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

export interface GamePlugin<
	TState = unknown,
	TInput extends string = string,
	TPrivateState = unknown,
	TConfig = unknown,
> {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly minPlayers: number;
	readonly maxPlayers: number;
	readonly viewMode: ViewMode;
	readonly aspectRatio?: number;
	readonly controls: readonly GameControlBinding[];

	/** Factory to create server game engine */
	createEngine(
		options: EngineInitOptions<TConfig>,
	): GameEngine<TState, TInput, TPrivateState>;

	/** Client-side visual renderers for Canvas 2D */
	client: {
		/** Canvas renderer for individual player card (per-player-card and hybrid-table modes) */
		drawPlayerCard?: (
			ctx: CanvasRenderingContext2D,
			player: PlayerSnapshot,
			bounds: RectBounds,
		) => void;
		/** Canvas renderer for central shared view (shared-canvas and hybrid-table modes) */
		drawSharedView?: (
			ctx: CanvasRenderingContext2D,
			room: RoomSnapshot,
			bounds: RectBounds,
		) => void;
	};
}
