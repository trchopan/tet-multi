export type SnakeDirection = 'up' | 'down' | 'left' | 'right';
export type SnakeInputAction = 'up' | 'down' | 'left' | 'right';

export interface Position {
	x: number;
	y: number;
}

export interface SnakePlayerState {
	playerId: string;
	displayName: string;
	body: Position[];
	direction: SnakeDirection;
	nextDirection: SnakeDirection;
	score: number;
	matchState: 'playing' | 'eliminated';
	eliminatedAtTick?: number;
	placement?: number;
	colorIndex: number;
}

export interface SnakeGameState {
	gridWidth: number;
	gridHeight: number;
	food: Position[];
	snakes: Record<
		string,
		{
			body: Position[];
			direction: SnakeDirection;
			score: number;
			matchState: 'playing' | 'eliminated';
			colorIndex: number;
		}
	>;
}
