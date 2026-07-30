import { describe, expect, it } from 'bun:test';
import { Room } from '../../server/room';
import { validateServerMessage } from '../../shared/protocol';
import { ServerMessageSchema } from '../../shared/schemas';
import { safeParse } from 'valibot';

describe('Room Poker Protocol Integration', () => {
	it('produces valid ServerMessage snapshots during full room lifecycle with Poker', () => {
		const room = new Room({ code: 'TESTAB', gameType: 'poker' });
		const mockSocket = { send: () => 1, close: () => {} };
		const { session } = room.join('client-1', 'Alice', mockSocket);
		const hostId = session!.playerId;

		room.addComputer(hostId, 'legendary');

		// Set ready and start
		room.setReady(hostId, true);
		room.start(hostId, Date.now());

		// Advance past countdown (3000ms)
		const matchTime = Date.now() + 3500;
		room.update(matchTime);

		// Get room snapshot
		const snapshot = room.snapshot(matchTime, hostId);
		const msg = {
			type: 'room_snapshot' as const,
			snapshot,
		};

		const parseResult = safeParse(ServerMessageSchema, msg);
		if (!parseResult.success) {
			console.log(
				'Valibot issues:',
				JSON.stringify(parseResult.issues, null, 2),
			);
		}

		expect(validateServerMessage(msg)).toBe(true);
	});
});
