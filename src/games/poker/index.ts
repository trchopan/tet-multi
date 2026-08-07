import type { GamePlugin } from '$/games/types';
import { PokerGameEngine } from './application/engine';
import { renderPokerSharedView } from './presentation/renderer';
import { gameRegistry } from '$/games/registry';

export * from './types';
export * from './application/engine';
export * from './domain/evaluator';

export const pokerPlugin: GamePlugin = {
	id: 'poker',
	name: "Texas Hold'em Poker",
	description:
		"Multiplayer 2-5 player Texas Hold'em Poker. Outsmart opponents with blinds, side pots, vector cards, and strategic betting!",
	minPlayers: 2,
	maxPlayers: 5,
	viewMode: 'shared-canvas',
	aspectRatio: 16 / 9,
	controls: [
		{
			action: 'button_a',
			label: 'Check / Call (A)',
			defaultKeys: ['a', 'A', 'Space', ' '],
		},
		{
			action: 'button_b',
			label: 'Fold (B)',
			defaultKeys: ['s', 'S'],
		},
		{
			action: 'button_x',
			label: 'Bet / Raise (X)',
			defaultKeys: ['z', 'Z'],
		},
		{
			action: 'button_y',
			label: 'All-In (Y)',
			defaultKeys: ['c', 'C'],
		},
		{
			action: 'up',
			label: 'Increase Bet',
			defaultKeys: ['ArrowUp'],
		},
		{
			action: 'down',
			label: 'Decrease Bet',
			defaultKeys: ['ArrowDown'],
		},
		{
			action: 'right',
			label: 'Double Bet',
			defaultKeys: ['ArrowRight'],
		},
		{
			action: 'left',
			label: 'Min Bet',
			defaultKeys: ['ArrowLeft'],
		},
	],
	createEngine(options) {
		return new PokerGameEngine(options.matchId, options.seed, options.players);
	},
	client: {
		drawSharedView(ctx, room, bounds) {
			renderPokerSharedView(ctx, room, bounds);
		},
	},
};

gameRegistry.register(pokerPlugin);
