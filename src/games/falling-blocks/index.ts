import type { GamePlugin } from '../types';
import { FallingBlocksGameEngine } from './application/engine';

export * from './constants';
export * from './types';
export * from './schemas/schemas';
export * from './application/engine';
export * from './domain/core-engine';
export * from './domain/board';
export * from './domain/pieces';
import {
	getCanvasMetrics,
	renderSnapshotBoard,
} from '../../lib/client/renderer';
import { gameRegistry } from '../registry';

export const fallingBlocksPlugin: GamePlugin = {
	id: 'falling-blocks',
	name: 'Falling Blocks',
	description:
		'Classic 2-5 player competitive falling-block game with garbage attacks and SRS rotations.',
	minPlayers: 1,
	maxPlayers: 5,
	viewMode: 'per-player-card',
	aspectRatio: 1 / 2,
	controls: [
		{ action: 'left', label: 'Move Left', defaultKeys: ['ArrowLeft', 'a'] },
		{ action: 'right', label: 'Move Right', defaultKeys: ['ArrowRight', 'd'] },
		{ action: 'down', label: 'Soft Drop', defaultKeys: ['ArrowDown', 's'] },
		{ action: 'up', label: 'Rotate CW', defaultKeys: ['ArrowUp', 'w'] },
		{ action: 'button_a', label: 'Hard Drop (A)', defaultKeys: [' ', 'Space'] },
		{
			action: 'button_b',
			label: 'Rotate CCW (B)',
			defaultKeys: ['z', 'Control'],
		},
		{ action: 'button_x', label: 'Rotate CW (X)', defaultKeys: ['x'] },
		{
			action: 'button_y',
			label: 'Hold Piece (Y)',
			defaultKeys: ['c', 'Shift'],
		},
	],
	createEngine(options) {
		return new FallingBlocksGameEngine(
			options.matchId,
			options.seed,
			options.players,
		);
	},
	client: {
		drawPlayerCard(ctx, player, bounds) {
			const metrics = getCanvasMetrics(bounds.width, bounds.height, 1);
			renderSnapshotBoard(ctx, player, metrics);
		},
	},
};

gameRegistry.register(fallingBlocksPlugin);
