import type { GamePlugin } from '../types';
import { PokerGameEngine } from './engine';
import { renderPokerSharedView } from './renderer';
import { gameRegistry } from '../registry';

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
			label: 'Check / Call',
			defaultKeys: ['Space', 'Enter', 'c', '1'],
		},

		{
			action: 'button_b',
			label: 'Fold',
			defaultKeys: ['Escape', 'f', 'b', '2'],
		},
		{
			action: 'button_x',
			label: 'Bet / Raise',
			defaultKeys: ['r', 'x', '3'],
		},
		{
			action: 'button_y',
			label: 'All-In',
			defaultKeys: ['y', '4'],
		},
		{
			action: 'up',
			label: 'Increase Bet',
			defaultKeys: ['ArrowUp', 'w'],
		},
		{
			action: 'down',
			label: 'Decrease Bet',
			defaultKeys: ['ArrowDown', 's'],
		},
		{
			action: 'right',
			label: 'Double Bet',
			defaultKeys: ['ArrowRight', 'd'],
		},
		{
			action: 'left',
			label: 'Min Bet',
			defaultKeys: ['ArrowLeft', 'a'],
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
