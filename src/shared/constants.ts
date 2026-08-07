export const PROTOCOL_VERSION = 2 as const;

export const MAX_INBOUND_MESSAGE_BYTES = 16 * 1024;
export const MAX_PLAYERS_PER_ROOM = 5;
export const MAX_COMPUTER_PLAYERS_PER_ROOM = 4;
export const MIN_PLAYERS_TO_START = 2;
export const COMPUTER_DIFFICULTIES = [
	'beginner',
	'challenger',
	'legendary',
] as const;
export const DEFAULT_COMPUTER_DIFFICULTY = 'legendary' as const;

export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const DISPLAY_NAME_MIN_LENGTH = 1;
export const DISPLAY_NAME_MAX_LENGTH = 20;

export const TICK_RATE = 60;
export const TICK_MS = 1000 / TICK_RATE;
export const NORMAL_SNAPSHOT_INTERVAL_TICKS = 3;
export const MAX_GAMEPLAY_INPUTS_PER_SECOND = 120;
export const GAMEPLAY_INPUT_BURST = 20;

export const INPUT_ACTIONS = [
	'up',
	'down',
	'left',
	'right',
	'button_a',
	'button_b',
	'button_x',
	'button_y',
] as const;

export const ROOM_PHASES = [
	'lobby',
	'countdown',
	'playing',
	'finished',
] as const;

export const PLAYER_MATCH_STATES = [
	'waiting',
	'playing',
	'disconnected',
	'eliminated',
] as const;

export const ERROR_CODES = [
	'INVALID_MESSAGE',
	'PROTOCOL_MISMATCH',
	'NOT_JOINED',
	'ROOM_NOT_FOUND',
	'ROOM_FULL',
	'MATCH_IN_PROGRESS',
	'INVALID_NAME',
	'NOT_HOST',
	'NOT_READY',
	'INSUFFICIENT_PLAYERS',
	'INVALID_PHASE',
	'INVALID_RECONNECT_TOKEN',
	'RATE_LIMITED',
	'INTERNAL_ERROR',
	'COMPUTER_LIMIT',
	'INVALID_PLAYER',
] as const;
