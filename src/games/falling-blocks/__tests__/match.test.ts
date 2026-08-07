import { describe, expect, test } from 'bun:test';
import {
	cloneMatchState,
	createAttackPacket,
	createMatchState,
	eliminatePlayers,
	hashMatchState,
	retargetAttackPackets,
} from '../domain/match';

describe('competitive match rules', () => {
	test('target and hole selection are deterministic', () => {
		const first = createMatchState('room-seed', ['a', 'b', 'c']);
		const second = cloneMatchState(first);
		expect(createAttackPacket(first, 'a', 4, 12)).toEqual(
			createAttackPacket(second, 'a', 4, 12),
		);
	});

	test('attacker and eliminated players are never valid targets', () => {
		const state = createMatchState('target-seed', ['a', 'b', 'c']);
		eliminatePlayers(state, ['b'], 4);
		expect(createAttackPacket(state, 'a', 1, 5)?.targetId).toBe('c');
	});

	test('delayed attacks retarget when the original target is eliminated', () => {
		const state = createMatchState('retarget-seed', ['a', 'b', 'c']);
		const packet = createAttackPacket(state, 'a', 2, 0);
		if (packet === undefined) throw new Error('Expected an attack target');
		const target = state.players.find(
			(player) => player.playerId === packet.targetId,
		);
		if (target === undefined) throw new Error('Expected target player');
		target.eliminated = true;
		const retargeted = retargetAttackPackets(state, [packet]);
		expect(retargeted).toHaveLength(1);
		expect(retargeted[0]?.targetId).not.toBe(packet.targetId);
	});

	test('attacks are discarded when no opponent remains', () => {
		const state = createMatchState('solo-seed', ['a', 'b']);
		eliminatePlayers(state, ['b'], 8);
		expect(createAttackPacket(state, 'a', 1, 9)).toBeUndefined();
	});

	test('same-tick final eliminations produce a draw', () => {
		const state = createMatchState('draw-seed', ['a', 'b', 'c']);
		eliminatePlayers(state, ['a'], 10);
		const result = eliminatePlayers(state, ['b', 'c'], 20);
		expect(result).toEqual({
			finished: true,
			winnerPlayerIds: [],
			drawPlayerIds: ['b', 'c'],
		});
		expect(
			state.players.filter((player) => player.placement === 2),
		).toHaveLength(2);
	});

	test('the last survivor wins and earlier eliminations have stable placement', () => {
		const state = createMatchState('winner-seed', ['a', 'b', 'c']);
		eliminatePlayers(state, ['a'], 10);
		const result = eliminatePlayers(state, ['b'], 20);
		expect(result.winnerPlayerIds).toEqual(['c']);
		expect(
			state.players.find((player) => player.playerId === 'a')?.placement,
		).toBe(3);
		expect(
			state.players.find((player) => player.playerId === 'b')?.placement,
		).toBe(2);
		expect(
			state.players.find((player) => player.playerId === 'c')?.placement,
		).toBe(1);
	});

	test('scripted targeting and elimination replay remains identical', () => {
		const run = (): string => {
			const state = createMatchState('replay-seed', ['a', 'b', 'c', 'd']);
			createAttackPacket(state, 'a', 2, 1);
			createAttackPacket(state, 'c', 3, 2);
			eliminatePlayers(state, ['b'], 30);
			retargetAttackPackets(state, []);
			return hashMatchState(state);
		};
		expect(run()).toBe(run());
	});
});
