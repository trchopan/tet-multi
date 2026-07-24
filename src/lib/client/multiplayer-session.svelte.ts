import { PROTOCOL_VERSION } from '../../shared/constants';
import type {
	ClientMessage,
	InputAction,
	PlayerSnapshot,
	RoomSnapshot,
	ServerMessage,
} from '../../shared/types';
import {
	INTERPOLATION_DELAY_MS,
	recordSnapshot,
	renderInterpolatedPlayer,
	type SnapshotHistory,
} from './interpolation';
import {
	reconcilePrediction,
	predictionToSnapshot,
	type PendingInput,
} from './prediction';
import { MultiplayerWebSocket, type ConnectionState } from './websocket';

type Intent = 'create' | 'join';

const tokenKey = (roomCode: string): string =>
	`tet-multi:reconnect:${roomCode}`;
const nameKey = 'tet-multi:display-name';

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

const removeStored = (key: string): void => {
	try {
		globalThis.localStorage?.removeItem(key);
	} catch {
		// Storage can be disabled; the live connection still works.
	}
};

export const getStoredDisplayName = (): string => getStored(nameKey) ?? '';

export const saveDisplayName = (displayName: string): void =>
	setStored(nameKey, displayName.trim());

export const getReconnectToken = (roomCode: string): string | undefined =>
	getStored(tokenKey(roomCode));

export const clearReconnectToken = (roomCode: string): void =>
	removeStored(tokenKey(roomCode));

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
	public predictedLocalPlayer = $state<PlayerSnapshot | undefined>(undefined);

	private transport: MultiplayerWebSocket | undefined;
	private intent: Intent | undefined;
	private requestId = 0;
	private inputSequence = 0;
	private pendingInputs: PendingInput[] = [];
	private authoritativeLocalPlayer: PlayerSnapshot | undefined;
	private readonly snapshotHistory: SnapshotHistory = new Map();
	private readonly pingSamples: Array<{ rtt: number; offset: number }> = [];
	private readonly pendingPings = new Map<string, number>();
	private latestServerTick = -1;
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

	public addComputer(): void {
		this.send({ type: 'add_computer' });
	}

	public removeComputer(playerId: string): void {
		this.send({ type: 'remove_computer', playerId });
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
		this.pendingInputs.push({ sequence: this.inputSequence, action });
		this.rebuildPrediction();
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
		this.pendingPings.clear();
	}

	public dispose(): void {
		this.close();
	}

	private startConnection(
		intent: Intent,
		roomCode: string,
		displayName: string,
	): void {
		this.transport?.close();
		const resetRoomState = intent === 'create' || this.roomCode !== roomCode;
		this.intent = intent;
		this.roomCode = roomCode;
		this.displayName = displayName.trim();
		this.error = '';
		if (resetRoomState) {
			this.snapshot = undefined;
			this.inputSequence = 0;
			this.pendingInputs = [];
			this.predictedLocalPlayer = undefined;
			this.authoritativeLocalPlayer = undefined;
			this.latestServerTick = -1;
			this.snapshotHistory.clear();
			this.pingSamples.length = 0;
			this.pendingPings.clear();
		}
		this.transport = new MultiplayerWebSocket({
			onMessage: (message) => this.handleMessage(message),
			onStateChange: (state) => (this.connectionState = state),
			onError: (message) => (this.error = message),
			onPing: (nonce, clientTime) => this.pendingPings.set(nonce, clientTime),
		});
		this.transport.connect();
	}

	private handleMessage(message: ServerMessage): void {
		if (message.type === 'hello_ack') {
			this.lastServerTime = message.serverTime;
			if (this.pingSamples.length === 0)
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
			this.flushPendingInputs();
			return;
		}
		if (message.type === 'room_snapshot') {
			if (message.snapshot.serverTick < this.latestServerTick) return;
			this.latestServerTick = message.snapshot.serverTick;
			recordSnapshot(
				this.snapshotHistory,
				message.snapshot.players,
				message.snapshot.serverTime,
			);
			this.snapshot = message.snapshot;
			this.lastServerTime = message.snapshot.serverTime;
			if (message.snapshot.phase !== 'playing') {
				this.pendingInputs = [];
				this.predictedLocalPlayer = undefined;
			}
			const localPlayer = message.snapshot.players.find(
				(player) => player.playerId === this.playerId,
			);
			if (localPlayer !== undefined) {
				this.authoritativeLocalPlayer = localPlayer;
				this.inputSequence = Math.max(
					this.inputSequence,
					localPlayer.lastProcessedInput ?? 0,
				);
				this.rebuildPrediction();
			}
			return;
		}
		if (message.type === 'match_started') {
			this.inputSequence = 0;
			this.pendingInputs = [];
			this.predictedLocalPlayer = undefined;
			return;
		}
		if (message.type === 'error') {
			this.error = message.message;
			if (
				message.code === 'ROOM_NOT_FOUND' ||
				message.code === 'INVALID_RECONNECT_TOKEN'
			) {
				clearReconnectToken(this.roomCode);
				this.transport?.stopRetrying();
				this.transport?.close();
			}
			return;
		}
		if (message.type === 'pong') {
			const receivedAt = Date.now();
			const sentAt = this.pendingPings.get(message.nonce) ?? message.clientTime;
			this.pendingPings.delete(message.nonce);
			const rtt = Math.max(0, receivedAt - sentAt);
			const offset = message.serverTime - (sentAt + rtt / 2);
			this.pingSamples.push({ rtt, offset });
			if (this.pingSamples.length > 8) this.pingSamples.shift();
			const best = this.pingSamples.reduce((lowest, sample) =>
				sample.rtt < lowest.rtt ? sample : lowest,
			);
			this.latencyMs = best.rtt;
			this.serverOffsetMs = best.offset;
			this.lastServerTime = message.serverTime;
		}
	}

	public renderPlayer(
		player: PlayerSnapshot,
		now = Date.now(),
	): PlayerSnapshot {
		if (player.playerId === this.playerId)
			return this.predictedLocalPlayer ?? player;
		return renderInterpolatedPlayer(
			this.snapshotHistory,
			player,
			now + this.serverOffsetMs - INTERPOLATION_DELAY_MS,
		);
	}

	private rebuildPrediction(): void {
		if (this.authoritativeLocalPlayer === undefined) return;
		const reconciled = reconcilePrediction(
			this.authoritativeLocalPlayer,
			this.pendingInputs,
		);
		if (reconciled === undefined) return;
		this.pendingInputs = reconciled.pending;
		this.predictedLocalPlayer = predictionToSnapshot(
			this.authoritativeLocalPlayer,
			reconciled.state,
		);
	}

	private flushPendingInputs(): void {
		const matchId = this.snapshot?.matchId;
		if (matchId === undefined) return;
		for (const input of this.pendingInputs)
			this.send({ type: 'input', matchId, ...input });
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
