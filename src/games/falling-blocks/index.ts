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
		{ action: 'move_left', label: 'Move Left', defaultKeys: ['ArrowLeft', 'a'] },
		{
			action: 'move_right',
			label: 'Move Right',
			defaultKeys: ['ArrowRight', 'd'],
		},
		{ action: 'soft_drop', label: 'Soft Drop', defaultKeys: ['ArrowDown', 's'] },
		{ action: 'hard_drop', label: 'Hard Drop', defaultKeys: ['Space'] },
		{
			action: 'rotate_cw',
			label: 'Rotate CW',
			defaultKeys: ['ArrowUp', 'w', 'x'],
		},
		{ action: 'rotate_ccw', label: 'Rotate CCW', defaultKeys: ['Control', 'z'] },
		{ action: 'hold', label: 'Hold Piece', defaultKeys: ['Shift', 'c'] },
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
