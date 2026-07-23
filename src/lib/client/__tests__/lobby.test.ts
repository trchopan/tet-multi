import { describe, expect, test } from 'bun:test';
import { getLobbyStartState } from '../lobby';
import type { PlayerSnapshot } from '../../../shared/types';

const player = (connected: boolean, ready: boolean): PlayerSnapshot => ({
	playerId: `${connected}-${ready}`,
	displayName: 'Player',
	shortId: 'player',
	joinedAt: 0,
	connected,
	ready,
	isHost: false,
	matchState: connected ? 'waiting' : 'disconnected',
});

describe('lobby start rules', () => {
	test('ignores disconnected sessions when checking readiness', () => {
		expect(
			getLobbyStartState([
				player(true, true),
				player(true, true),
				player(false, false),
			]),
		).toEqual({ canStart: true, reason: 'Ready to launch.' });
	});

	test('requires two connected players and all connected players ready', () => {
		expect(getLobbyStartState([player(true, true)])).toMatchObject({
			canStart: false,
			reason: 'At least two connected players are required.',
		});
		expect(
			getLobbyStartState([player(true, true), player(true, false)]),
		).toMatchObject({
			canStart: false,
			reason: 'Every connected player must be ready.',
		});
	});
});
