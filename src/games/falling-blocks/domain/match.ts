import { BOARD_WIDTH } from '../constants';
import { createGarbagePacket, type GarbagePacket } from './garbage';
import {
	createRandomState,
	nextRandomIndex,
	type RandomState,
} from '../../../shared/random';

export interface MatchPlayerState {
	playerId: string;
	joinOrder: number;
	connected: boolean;
	eliminated: boolean;
	eliminatedAtTick?: number;
	placement?: number;
}

export interface MatchState {
	seed: string;
	random: RandomState;
	players: MatchPlayerState[];
}

export interface AttackPacket extends GarbagePacket {
	attackerId: string;
	targetId: string;
}

export interface MatchResult {
	finished: boolean;
	winnerPlayerIds: string[];
	drawPlayerIds: string[];
}

export const createMatchState = (
	seed: string,
	playerIds: readonly string[],
): MatchState => ({
	seed,
	random: createRandomState(seed),
	players: playerIds.map((playerId, joinOrder) => ({
		playerId,
		joinOrder,
		connected: true,
		eliminated: false,
	})),
});

export const cloneMatchState = (state: MatchState): MatchState => ({
	seed: state.seed,
	random: { ...state.random },
	players: state.players.map((player) => ({ ...player })),
});

const getPlayer = (state: MatchState, playerId: string): MatchPlayerState => {
	const player = state.players.find(
		(candidate) => candidate.playerId === playerId,
	);
	if (player === undefined) throw new Error(`Unknown player: ${playerId}`);
	return player;
};

const validTargets = (
	state: MatchState,
	attackerId: string,
): MatchPlayerState[] =>
	state.players
		.filter(
			(player) =>
				player.playerId !== attackerId &&
				player.connected &&
				!player.eliminated,
		)
		.sort((first, second) => first.joinOrder - second.joinOrder);

export const chooseTarget = (
	state: MatchState,
	attackerId: string,
): string | undefined => {
	const attacker = getPlayer(state, attackerId);
	if (!attacker.connected || attacker.eliminated) return undefined;
	const targets = validTargets(state, attackerId);
	if (targets.length === 0) return undefined;
	const target = targets[nextRandomIndex(state.random, targets.length)];
	return target?.playerId;
};

export const createAttackPacket = (
	state: MatchState,
	attackerId: string,
	lines: number,
	createdTick: number,
): AttackPacket | undefined => {
	if (!Number.isInteger(lines) || lines < 1)
		throw new RangeError('Attack lines must be positive');
	const targetId = chooseTarget(state, attackerId);
	if (targetId === undefined) return undefined;
	const hole = nextRandomIndex(state.random, BOARD_WIDTH);
	return {
		...createGarbagePacket(lines, hole, createdTick),
		attackerId,
		targetId,
	};
};

export const retargetAttackPackets = (
	state: MatchState,
	packets: readonly AttackPacket[],
): AttackPacket[] => {
	const retargeted: AttackPacket[] = [];
	for (const packet of packets) {
		const target = getPlayer(state, packet.targetId);
		if (target.connected && !target.eliminated) {
			retargeted.push({ ...packet });
			continue;
		}
		const nextTarget = chooseTarget(state, packet.attackerId);
		if (nextTarget !== undefined)
			retargeted.push({ ...packet, targetId: nextTarget });
	}
	return retargeted;
};

const activePlayers = (state: MatchState): MatchPlayerState[] =>
	state.players
		.filter((player) => !player.eliminated)
		.sort((first, second) => first.joinOrder - second.joinOrder);

export const eliminatePlayers = (
	state: MatchState,
	playerIds: readonly string[],
	tick: number,
): MatchResult => {
	if (!Number.isInteger(tick) || tick < 0)
		throw new RangeError('Elimination tick must be non-negative');
	const activeBefore = activePlayers(state);
	const eliminated = new Set(playerIds);
	const group = activeBefore.filter((player) =>
		eliminated.has(player.playerId),
	);
	if (group.length === 0)
		return { finished: false, winnerPlayerIds: [], drawPlayerIds: [] };
	const placement = activeBefore.length;
	for (const player of group) {
		player.eliminated = true;
		player.eliminatedAtTick = tick;
		player.placement = placement;
	}
	const activeAfter = activePlayers(state);
	if (activeAfter.length === 1) {
		const winner = activeAfter[0];
		if (winner !== undefined) winner.placement = 1;
		return {
			finished: true,
			winnerPlayerIds: winner === undefined ? [] : [winner.playerId],
			drawPlayerIds: [],
		};
	}
	if (activeAfter.length === 0)
		return {
			finished: true,
			winnerPlayerIds: [],
			drawPlayerIds: group.map((player) => player.playerId),
		};
	return { finished: false, winnerPlayerIds: [], drawPlayerIds: [] };
};

export const serializeMatchState = (state: MatchState): string =>
	JSON.stringify({
		seed: state.seed,
		random: { ...state.random },
		players: state.players.map((player) => ({ ...player })),
	});

export const hashMatchState = (state: MatchState): string => {
	const input = serializeMatchState(state);
	let hash = 0x811c9dc5;
	for (let index = 0; index < input.length; index += 1)
		hash = Math.imul(hash ^ input.charCodeAt(index), 0x01000193);
	return (hash >>> 0).toString(16).padStart(8, '0');
};
