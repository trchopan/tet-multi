import type {
	ERROR_CODES,
	COMPUTER_DIFFICULTIES,
	INPUT_ACTIONS,
	PLAYER_MATCH_STATES,
	ROOM_PHASES,
} from './constants';

export type InputAction = (typeof INPUT_ACTIONS)[number] | string;
export type RoomPhase = (typeof ROOM_PHASES)[number];
export type PlayerMatchState = (typeof PLAYER_MATCH_STATES)[number];
export type ErrorCode = (typeof ERROR_CODES)[number];
export type PlayerType = 'human' | 'computer';
export type ComputerDifficulty = (typeof COMPUTER_DIFFICULTIES)[number];

export interface ClientHelloMessage {
	type: 'hello';
	protocolVersion: 2;
	clientId: string;
}

export interface ClientCreateRoomMessage {
	type: 'create_room';
	requestId: string;
	displayName: string;
	gameType?: string | undefined;
}

export interface ClientJoinRoomMessage {
	type: 'join_room';
	requestId: string;
	roomCode: string;
	displayName: string;
	reconnectToken?: string;
}

export interface ClientSetReadyMessage {
	type: 'set_ready';
	ready: boolean;
}

export interface ClientStartMatchMessage {
	type: 'start_match';
}

export interface ClientAddComputerMessage {
	type: 'add_computer';
	difficulty: ComputerDifficulty;
}

export interface ClientRemoveComputerMessage {
	type: 'remove_computer';
	playerId: string;
}

export interface ClientInputMessage {
	type: 'input';
	matchId: string;
	sequence: number;
	action: InputAction;
}

export interface ClientReturnToLobbyMessage {
	type: 'return_to_lobby';
}

export interface ClientLeaveRoomMessage {
	type: 'leave_room';
}

export interface ClientPingMessage {
	type: 'ping';
	nonce: string;
	clientTime: number;
}

export type ClientMessage =
	| ClientHelloMessage
	| ClientCreateRoomMessage
	| ClientJoinRoomMessage
	| ClientSetReadyMessage
	| ClientStartMatchMessage
	| ClientAddComputerMessage
	| ClientRemoveComputerMessage
	| ClientInputMessage
	| ClientReturnToLobbyMessage
	| ClientLeaveRoomMessage
	| ClientPingMessage;

export interface PlayerSnapshot {
	playerId: string;
	displayName: string;
	shortId: string;
	playerType: PlayerType;
	computerDifficulty?: ComputerDifficulty;
	joinedAt: number;
	connected: boolean;
	ready: boolean;
	isHost: boolean;
	matchState: PlayerMatchState;
	placement?: number;
	eliminatedAtTick?: number;
	score?: number;
	lastProcessedInput?: number;
	customState?: unknown;
	[key: string]: unknown;
}

export interface RoomSnapshot {
	protocolVersion: 2;
	roomCode: string;
	gameType?: string | undefined;
	customGameState?: unknown;
	phase: RoomPhase;
	hostPlayerId: string;
	serverTick: number;
	serverTime: number;
	countdownEndsAt?: number;
	matchId?: string;
	winnerPlayerIds?: string[];
	players: PlayerSnapshot[];
}

export interface ServerHelloAckMessage {
	type: 'hello_ack';
	protocolVersion: 2;
	serverTime: number;
}

export interface ServerRoomJoinedMessage {
	type: 'room_joined';
	requestId: string;
	roomCode: string;
	playerId: string;
	reconnectToken: string;
	hostPlayerId: string;
}

export interface ServerRoomSnapshotMessage {
	type: 'room_snapshot';
	snapshot: RoomSnapshot;
}

export interface ServerMatchStartedMessage {
	type: 'match_started';
	matchId: string;
	seed: string;
	startTick: number;
	serverTime: number;
}

export interface ServerErrorMessage {
	type: 'error';
	requestId?: string;
	code: ErrorCode;
	message: string;
	recoverable: boolean;
}

export interface ServerPongMessage {
	type: 'pong';
	nonce: string;
	clientTime: number;
	serverTime: number;
}

export type ServerMessage =
	| ServerHelloAckMessage
	| ServerRoomJoinedMessage
	| ServerRoomSnapshotMessage
	| ServerMatchStartedMessage
	| ServerErrorMessage
	| ServerPongMessage;
