import type { PlayerSnapshot } from '../../shared/types';

export interface LobbyStartState {
	canStart: boolean;
	reason: string;
}

export const getLobbyStartState = (
	players: readonly PlayerSnapshot[],
): LobbyStartState => {
	const connected = players.filter((player) => player.connected);
	if (connected.length < 2)
		return {
			canStart: false,
			reason: 'At least two connected players are required.',
		};
	if (!connected.every((player) => player.ready))
		return {
			canStart: false,
			reason: 'Every connected player must be ready.',
		};
	return { canStart: true, reason: 'Ready to launch.' };
};
