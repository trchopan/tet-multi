import type { GamePlugin } from '../types';
import { SnakeGameEngine } from './engine';
import { renderSnakeSharedView } from './renderer';
import { gameRegistry } from '../registry';

export const snakePlugin: GamePlugin = {
	id: 'snake',
	name: 'Snake Arena',
	description:
		'Multiplayer 2-5 player snake arena. Grow by eating food, dodge walls, and eat smaller snakes!',
	minPlayers: 2,
	maxPlayers: 5,
	viewMode: 'shared-canvas',
	aspectRatio: 4 / 3,
	controls: [
		{ action: 'up', label: 'Move Up', defaultKeys: ['ArrowUp', 'w'] },
		{ action: 'down', label: 'Move Down', defaultKeys: ['ArrowDown', 's'] },
		{ action: 'left', label: 'Move Left', defaultKeys: ['ArrowLeft', 'a'] },
		{ action: 'right', label: 'Move Right', defaultKeys: ['ArrowRight', 'd'] },
	],
	createEngine(options) {
		return new SnakeGameEngine(options.matchId, options.seed, options.players);
	},
	client: {
		drawSharedView(ctx, room, bounds) {
			renderSnakeSharedView(ctx, room, bounds);
		},
	},
};

gameRegistry.register(snakePlugin);
