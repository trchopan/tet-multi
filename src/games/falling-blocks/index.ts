import type { GamePlugin } from '../types';
import { FallingBlocksGameEngine } from './engine';
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
		{
			action: 'right',
			label: 'Move Right',
			defaultKeys: ['ArrowRight', 'd'],
		},
		{ action: 'down', label: 'Soft Drop', defaultKeys: ['ArrowDown', 's'] },
		{ action: 'button_a', label: 'Hard Drop', defaultKeys: ['Space', 'w'] },
		{
			action: 'button_x',
			label: 'Rotate CW',
			defaultKeys: ['ArrowUp', 'x'],
		},
		{ action: 'button_b', label: 'Rotate CCW', defaultKeys: ['Control', 'z'] },
		{ action: 'button_y', label: 'Hold Piece', defaultKeys: ['Shift', 'c'] },
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
