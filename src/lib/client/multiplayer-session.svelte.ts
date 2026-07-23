import { PROTOCOL_VERSION } from '../../shared/constants';
import type {
	ClientMessage,
	InputAction,
	RoomSnapshot,
	ServerMessage,
} from '../../shared/types';
import { MultiplayerWebSocket, type ConnectionState } from './websocket';

type Intent = 'create' | 'join';

const tokenKey = (roomCode: string): string =>
	`neon-drop:reconnect:${roomCode}`;
const nameKey = 'neon-drop:display-name';

const getStored = (key: string): string | undefined => {
	try {
		return globalThis.localStorage?.getItem(key) ?? undefined;
	} catch {
		return undefined;
	}
};

const setStored = (key: string, value: string): void => {
	try {
		globalThis.localStorage?.setItem(key, value);
	} catch {
		// Storage can be disabled; the live connection still works.
	}
};

export const getStoredDisplayName = (): string => getStored(nameKey) ?? '';

export const saveDisplayName = (displayName: string): void =>
	setStored(nameKey, displayName.trim());

export const getReconnectToken = (roomCode: string): string | undefined =>
	getStored(tokenKey(roomCode));

export const countdownLabel = (remainingMs: number): string =>
	remainingMs <= 0 ? 'GO' : String(Math.ceil(remainingMs / 1000));

export const canSendGameplayInput = (phase: RoomSnapshot['phase']): boolean =>
	phase === 'playing';

export class MultiplayerSession {
	public snapshot = $state<RoomSnapshot | undefined>(undefined);
	public connectionState = $state<ConnectionState>('closed');
	public error = $state('');
	public roomCode = $state('');
	public playerId = $state('');
	public displayName = $state('');
	public latencyMs = $state<number | undefined>(undefined);
	public lastServerTime = $state<number | undefined>(undefined);
	public serverOffsetMs = $state(0);

	private transport: MultiplayerWebSocket | undefined;
	private intent: Intent | undefined;
	private requestId = 0;
	private inputSequence = 0;
	private readonly onRoomJoined: ((roomCode: string) => void) | undefined;

	public constructor(onRoomJoined?: (roomCode: string) => void) {
		this.onRoomJoined = onRoomJoined;
	}

	public createRoom(displayName: string): void {
		this.startConnection('create', '', displayName);
	}

	public joinRoom(roomCode: string, displayName: string): void {
		this.startConnection('join', roomCode.toUpperCase(), displayName);
	}

	public reconnect(roomCode: string, displayName: string): void {
		this.startConnection('join', roomCode.toUpperCase(), displayName);
	}

	public setReady(ready: boolean): void {
		this.send({ type: 'set_ready', ready });
	}

	public startMatch(): void {
		this.send({ type: 'start_match' });
	}

	public returnToLobby(): void {
		this.send({ type: 'return_to_lobby' });
	}

	public leaveRoom(): void {
		this.send({ type: 'leave_room' });
		this.close();
	}

	public sendInput(action: InputAction): void {
		const matchId = this.snapshot?.matchId;
		if (
			matchId === undefined ||
			this.snapshot === undefined ||
			!canSendGameplayInput(this.snapshot.phase)
		)
			return;
		this.inputSequence += 1;
		this.send({
			type: 'input',
			matchId,
			sequence: this.inputSequence,
			action,
		});
	}

	public close(): void {
		this.transport?.close();
		this.transport = undefined;
		this.connectionState = 'closed';
	}

	public dispose(): void {
		this.close();
	}

	private startConnection(
		intent: Intent,
		roomCode: string,
		displayName: string,
	): void {
		this.intent = intent;
		this.roomCode = roomCode;
		this.displayName = displayName.trim();
		this.error = '';
		this.snapshot = undefined;
		this.inputSequence = 0;
		this.transport = new MultiplayerWebSocket({
			onMessage: (message) => this.handleMessage(message),
			onStateChange: (state) => (this.connectionState = state),
			onError: (message) => (this.error = message),
		});
		this.transport.connect();
	}

	private handleMessage(message: ServerMessage): void {
		if (message.type === 'hello_ack') {
			this.lastServerTime = message.serverTime;
			this.serverOffsetMs = message.serverTime - Date.now();
			if (this.intent === 'create') {
				this.send({
					type: 'create_room',
					requestId: this.nextRequestId(),
					displayName: this.displayName,
				});
			} else {
				const reconnectToken = getReconnectToken(this.roomCode);
				this.send({
					type: 'join_room',
					requestId: this.nextRequestId(),
					roomCode: this.roomCode,
					displayName: this.displayName,
					...(reconnectToken === undefined ? {} : { reconnectToken }),
				});
			}
			return;
		}
		if (message.type === 'room_joined') {
			this.roomCode = message.roomCode;
			this.playerId = message.playerId;
			setStored(tokenKey(message.roomCode), message.reconnectToken);
			this.onRoomJoined?.(message.roomCode);
			return;
		}
		if (message.type === 'room_snapshot') {
			this.snapshot = message.snapshot;
			this.lastServerTime = message.snapshot.serverTime;
			this.serverOffsetMs = message.snapshot.serverTime - Date.now();
			return;
		}
		if (message.type === 'match_started') {
			this.inputSequence = 0;
			return;
		}
		if (message.type === 'error') {
			this.error = message.message;
			return;
		}
		if (message.type === 'pong') {
			this.latencyMs = Math.max(0, Date.now() - message.clientTime);
			this.lastServerTime = message.serverTime;
			this.serverOffsetMs = message.serverTime - Date.now();
		}
	}

	private send(message: ClientMessage): void {
		this.transport?.send(message);
	}

	private nextRequestId(): string {
		this.requestId += 1;
		return `request-${this.requestId}`;
	}
}

export const protocolVersion = PROTOCOL_VERSION;
