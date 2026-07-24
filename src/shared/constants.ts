export const PROTOCOL_VERSION = 1 as const;

export const MAX_INBOUND_MESSAGE_BYTES = 16 * 1024;
export const MAX_PLAYERS_PER_ROOM = 5;
export const MIN_PLAYERS_TO_START = 2;

export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const DISPLAY_NAME_MIN_LENGTH = 1;
export const DISPLAY_NAME_MAX_LENGTH = 20;
export const NEXT_PREVIEW_COUNT = 5;

export const BOARD_WIDTH = 10;
export const BOARD_HIDDEN_HEIGHT = 4;
export const BOARD_VISIBLE_HEIGHT = 20;
export const BOARD_INTERNAL_HEIGHT = 24;
export const BOARD_CELL_COUNT = BOARD_WIDTH * BOARD_INTERNAL_HEIGHT;
export const GARBAGE_CELL_VALUE = 8 as const;
export const GARBAGE_ACTIVATION_TICKS = 30;
export const TICK_RATE = 60;
export const TICK_MS = 1000 / TICK_RATE;
export const NORMAL_SNAPSHOT_INTERVAL_TICKS = 3;
export const MAX_GAMEPLAY_INPUTS_PER_SECOND = 120;
export const GAMEPLAY_INPUT_BURST = 20;

export const SNAPSHOT_CELL_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;

export const PIECE_KINDS = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'] as const;

export const INPUT_ACTIONS = [
	'move_left',
	'move_right',
	'soft_drop',
	'hard_drop',
	'rotate_cw',
	'rotate_ccw',
	'hold',
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
] as const;
