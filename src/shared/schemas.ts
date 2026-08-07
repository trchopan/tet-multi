import {
	array,
	boolean,
	check,
	integer,
	literal,
	length,
	looseObject,
	maxLength,
	minLength,
	minValue,
	number,
	optional,
	pipe,
	safeParse,
	strictObject,
	string,
	union,
	unknown,
} from 'valibot';
import {
	COMPUTER_DIFFICULTIES,
	DISPLAY_NAME_MAX_LENGTH,
	DISPLAY_NAME_MIN_LENGTH,
	ERROR_CODES,
	MAX_PLAYERS_PER_ROOM,
	PLAYER_MATCH_STATES,
	PROTOCOL_VERSION,
	ROOM_CODE_ALPHABET,
	ROOM_CODE_LENGTH,
	ROOM_PHASES,
} from './constants';

const literals = <const T extends readonly (string | number)[]>(values: T) =>
	union(values.map((value) => literal(value)));

const nonEmptyString = pipe(string(), minLength(1));
const identifier = pipe(nonEmptyString, maxLength(256));
const unixMilliseconds = pipe(number(), integer(), minValue(0));
const nonNegativeInteger = pipe(number(), integer(), minValue(0));
const positiveInteger = pipe(number(), integer(), minValue(1));
const invisibleNameCharacter = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;

const displayName = pipe(
	string(),
	check((value) => {
		const trimmed = value.trim();
		return (
			[...trimmed].length >= DISPLAY_NAME_MIN_LENGTH &&
			[...trimmed].length <= DISPLAY_NAME_MAX_LENGTH &&
			!Array.from(trimmed).some((character) =>
				invisibleNameCharacter.test(character),
			)
		);
	}, 'Display name must contain 1-20 visible characters'),
);

const roomCode = pipe(
	string(),
	length(ROOM_CODE_LENGTH),
	check(
		(value) =>
			[...value.toUpperCase()].every((character) =>
				ROOM_CODE_ALPHABET.includes(character),
			),
		'Room code contains invalid characters',
	),
);

const protocolVersion = literal(PROTOCOL_VERSION);
const computerDifficulty = literals(COMPUTER_DIFFICULTIES);
const inputAction = pipe(nonEmptyString, maxLength(64));
const roomPhase = literals(ROOM_PHASES);
const playerMatchState = literals(PLAYER_MATCH_STATES);
const errorCode = literals(ERROR_CODES);

export const ClientMessageSchema = union([
	strictObject({
		type: literal('hello'),
		protocolVersion,
		clientId: identifier,
	}),
	strictObject({
		type: literal('create_room'),
		requestId: identifier,
		displayName,
		gameType: optional(identifier),
	}),
	strictObject({
		type: literal('join_room'),
		requestId: identifier,
		roomCode,
		displayName,
		reconnectToken: optional(identifier),
	}),
	strictObject({
		type: literal('set_ready'),
		ready: boolean(),
	}),
	strictObject({ type: literal('start_match') }),
	strictObject({
		type: literal('add_computer'),
		difficulty: computerDifficulty,
	}),
	strictObject({
		type: literal('remove_computer'),
		playerId: identifier,
	}),
	strictObject({
		type: literal('input'),
		matchId: identifier,
		sequence: positiveInteger,
		action: inputAction,
	}),
	strictObject({ type: literal('return_to_lobby') }),
	strictObject({ type: literal('leave_room') }),
	strictObject({
		type: literal('ping'),
		nonce: identifier,
		clientTime: unixMilliseconds,
	}),
]);

const playerSnapshot = pipe(
	looseObject({
		playerId: identifier,
		displayName,
		shortId: identifier,
		playerType: union([literal('human'), literal('computer')]),
		computerDifficulty: optional(computerDifficulty),
		joinedAt: unixMilliseconds,
		connected: boolean(),
		ready: boolean(),
		isHost: boolean(),
		matchState: playerMatchState,
		placement: optional(positiveInteger),
		eliminatedAtTick: optional(nonNegativeInteger),
		score: optional(nonNegativeInteger),
		lastProcessedInput: optional(nonNegativeInteger),
		customState: optional(unknown()),
	}),
	check(
		(player) =>
			player.playerType === 'computer'
				? player.computerDifficulty !== undefined
				: player.computerDifficulty === undefined,
		'Computer snapshots require a difficulty and human snapshots must not have one',
	),
);

export const RoomSnapshotSchema = strictObject({
	protocolVersion,
	roomCode,
	gameType: optional(identifier),
	customGameState: optional(unknown()),
	phase: roomPhase,
	hostPlayerId: identifier,
	serverTick: nonNegativeInteger,
	serverTime: unixMilliseconds,
	countdownEndsAt: optional(unixMilliseconds),
	matchId: optional(identifier),
	winnerPlayerIds: optional(
		pipe(array(identifier), maxLength(MAX_PLAYERS_PER_ROOM)),
	),
	players: pipe(array(playerSnapshot), maxLength(MAX_PLAYERS_PER_ROOM)),
});

export const ServerMessageSchema = union([
	strictObject({
		type: literal('hello_ack'),
		protocolVersion,
		serverTime: unixMilliseconds,
	}),
	strictObject({
		type: literal('room_joined'),
		requestId: identifier,
		roomCode,
		playerId: identifier,
		reconnectToken: identifier,
		hostPlayerId: identifier,
	}),
	strictObject({
		type: literal('room_snapshot'),
		snapshot: RoomSnapshotSchema,
	}),
	strictObject({
		type: literal('match_started'),
		matchId: identifier,
		seed: identifier,
		startTick: nonNegativeInteger,
		serverTime: unixMilliseconds,
	}),
	strictObject({
		type: literal('error'),
		requestId: optional(identifier),
		code: errorCode,
		message: nonEmptyString,
		recoverable: boolean(),
	}),
	strictObject({
		type: literal('pong'),
		nonce: identifier,
		clientTime: unixMilliseconds,
		serverTime: unixMilliseconds,
	}),
]);

export { safeParse };
