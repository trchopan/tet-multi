import { describe, expect, test } from 'bun:test';
import {
	MAX_INBOUND_MESSAGE_BYTES,
	NEXT_PREVIEW_COUNT,
	PROTOCOL_VERSION,
} from './constants';
import {
	decodeClientMessage,
	encodeServerMessage,
	validateServerMessage,
} from './protocol';
import { safeParse, RoomSnapshotSchema } from './schemas';
import type { RoomSnapshot, ServerMessage } from './types';

const validClientMessages = [
	{ type: 'hello', protocolVersion: PROTOCOL_VERSION, clientId: 'client-1' },
	{ type: 'create_room', requestId: 'request-1', displayName: ' Alice ' },
	{
		type: 'join_room',
		requestId: 'request-2',
		roomCode: 'abc234',
		displayName: ' Bob ',
		reconnectToken: 'token-1',
	},
	{ type: 'set_ready', ready: true },
	{ type: 'start_match' },
	{ type: 'add_computer' },
	{ type: 'remove_computer', playerId: 'computer-1' },
	{ type: 'input', matchId: 'match-1', sequence: 1, action: 'move_left' },
	{ type: 'return_to_lobby' },
	{ type: 'leave_room' },
	{ type: 'ping', nonce: 'nonce-1', clientTime: 1_700_000_000_000 },
] as const;

const validSnapshot = {
	protocolVersion: PROTOCOL_VERSION,
	roomCode: 'ABC234',
	phase: 'lobby',
	hostPlayerId: 'player-1',
	serverTick: 0,
	serverTime: 1_700_000_000_000,
	players: [
		{
			playerId: 'player-1',
			displayName: 'Alice',
			shortId: 'p1',
			playerType: 'human',
			joinedAt: 1_700_000_000_000,
			connected: true,
			ready: false,
			isHost: true,
			matchState: 'waiting',
			maxCombo: 0,
			attackSent: 0,
		},
	],
} satisfies RoomSnapshot;

describe('shared protocol', () => {
	test('accepts every client message variant', () => {
		for (const message of validClientMessages) {
			const result = decodeClientMessage(JSON.stringify(message));
			expect(result.success).toBe(true);
		}
	});

	test('normalizes names and room codes at the protocol boundary', () => {
		const result = decodeClientMessage(JSON.stringify(validClientMessages[2]));

		expect(result).toEqual({
			success: true,
			message: {
				type: 'join_room',
				requestId: 'request-2',
				roomCode: 'ABC234',
				displayName: 'Bob',
				reconnectToken: 'token-1',
			},
		});
	});

	test('rejects malformed, oversized, and unknown messages safely', () => {
		expect(decodeClientMessage('{')).toMatchObject({
			success: false,
			code: 'INVALID_MESSAGE',
		});
		expect(
			decodeClientMessage(JSON.stringify({ type: 'unknown' })),
		).toMatchObject({ success: false, code: 'INVALID_MESSAGE' });
		expect(
			decodeClientMessage(
				JSON.stringify({ type: 'start_match', unexpected: true }),
			),
		).toMatchObject({ success: false, code: 'INVALID_MESSAGE' });
		expect(
			decodeClientMessage('x'.repeat(MAX_INBOUND_MESSAGE_BYTES + 1)),
		).toMatchObject({ success: false, code: 'INVALID_MESSAGE' });
		expect(
			decodeClientMessage('x'.repeat(MAX_INBOUND_MESSAGE_BYTES * 4 + 1)),
		).toMatchObject({ success: false, code: 'INVALID_MESSAGE' });
	});

	test('requires player type in every snapshot player', () => {
		const player = validSnapshot.players[0];
		if (player === undefined) throw new Error('Snapshot fixture is empty');
		const { playerType: _playerType, ...legacyPlayer } = player;
		expect(
			safeParse(RoomSnapshotSchema, {
				...validSnapshot,
				players: [legacyPlayer],
			}).success,
		).toBe(false);
	});

	test('distinguishes an incompatible hello protocol version', () => {
		const result = decodeClientMessage(
			JSON.stringify({
				type: 'hello',
				protocolVersion: 999,
				clientId: 'client',
			}),
		);

		expect(result).toMatchObject({
			success: false,
			code: 'PROTOCOL_MISMATCH',
		});
	});

	test('rejects invalid names, room codes, input sequences, and timestamps', () => {
		const invalidMessages = [
			{ type: 'create_room', requestId: 'request', displayName: '   ' },
			{ type: 'create_room', requestId: 'request', displayName: 'bad\nname' },
			{
				type: 'create_room',
				requestId: 'request',
				displayName: '\u200B',
			},
			{
				type: 'create_room',
				requestId: 'request',
				displayName: 'name\u202E',
			},
			{
				type: 'join_room',
				requestId: 'request',
				roomCode: 'ABC012',
				displayName: 'name',
			},
			{ type: 'input', matchId: 'match', sequence: 0, action: 'hold' },
			{ type: 'ping', nonce: 'nonce', clientTime: -1 },
		];

		for (const message of invalidMessages) {
			expect(decodeClientMessage(JSON.stringify(message)).success).toBe(false);
		}
	});

	test('counts display names by Unicode code point', () => {
		const twentyEmoji = '😀'.repeat(20);
		const twentyOneEmoji = '😀'.repeat(21);

		expect(
			decodeClientMessage(
				JSON.stringify({
					type: 'create_room',
					requestId: 'request',
					displayName: twentyEmoji,
				}),
			).success,
		).toBe(true);
		expect(
			decodeClientMessage(
				JSON.stringify({
					type: 'create_room',
					requestId: 'request',
					displayName: twentyOneEmoji,
				}),
			).success,
		).toBe(false);
	});

	test('validates snapshots and rejects malformed boards', () => {
		expect(safeParse(RoomSnapshotSchema, validSnapshot).success).toBe(true);
		expect(
			safeParse(RoomSnapshotSchema, {
				...validSnapshot,
				players: [
					{
						...validSnapshot.players[0],
						next: Array.from({ length: NEXT_PREVIEW_COUNT }, () => 'I'),
					},
				],
			}).success,
		).toBe(true);
		expect(
			safeParse(RoomSnapshotSchema, {
				...validSnapshot,
				players: [
					{
						...validSnapshot.players[0],
						next: ['I'],
					},
				],
			}).success,
		).toBe(false);
		expect(
			safeParse(RoomSnapshotSchema, {
				...validSnapshot,
				players: [
					{
						...validSnapshot.players[0],
						next: Array.from({ length: NEXT_PREVIEW_COUNT + 1 }, () => 'I'),
					},
				],
			}).success,
		).toBe(false);
		expect(
			safeParse(RoomSnapshotSchema, {
				...validSnapshot,
				players: [
					{
						...validSnapshot.players[0],
						board: [0],
					},
				],
			}).success,
		).toBe(false);
	});

	test('validates server messages before encoding', () => {
		const messages: ServerMessage[] = [
			{
				type: 'hello_ack',
				protocolVersion: PROTOCOL_VERSION,
				serverTime: 1_700_000_000_000,
			},
			{
				type: 'room_joined',
				requestId: 'request-1',
				roomCode: 'ABC234',
				playerId: 'player-1',
				reconnectToken: 'token-1',
				hostPlayerId: 'player-1',
			},
			{ type: 'room_snapshot', snapshot: validSnapshot },
			{
				type: 'match_started',
				matchId: 'match-1',
				seed: 'seed-1',
				startTick: 180,
				serverTime: 1_700_000_000_000,
			},
			{
				type: 'error',
				requestId: 'request-1',
				code: 'ROOM_FULL',
				message: 'Room is full',
				recoverable: true,
			},
			{
				type: 'pong',
				nonce: 'nonce-1',
				clientTime: 1_700_000_000_000,
				serverTime: 1_700_000_000_010,
			},
		] as const;

		for (const message of messages) {
			expect(validateServerMessage(message)).toBe(true);
			expect(encodeServerMessage(message)).toBe(JSON.stringify(message));
		}
		expect(validateServerMessage({ ...messages[0], unexpected: true })).toBe(
			false,
		);
	});
});
