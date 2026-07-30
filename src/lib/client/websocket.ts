import { validateServerMessage } from '../../shared/protocol';
import { PROTOCOL_VERSION } from '../../shared/constants';
import type { ServerMessage } from '../../shared/types';

export type ConnectionState =
	'connecting' | 'connected' | 'reconnecting' | 'stale' | 'closed';

export interface WebSocketClientOptions {
	onMessage: (message: ServerMessage) => void;
	onStateChange: (state: ConnectionState) => void;
	onError: (message: string) => void;
	onPing?: (nonce: string, clientTime: number) => void;
	now?: () => number;
	random?: () => number;
	setTimeout?: (
		callback: () => void,
		delay: number,
	) => ReturnType<typeof globalThis.setTimeout>;
	clearTimeout?: (timer: ReturnType<typeof globalThis.setTimeout>) => void;
}

const websocketUrl = (): string => {
	const location = globalThis.location;
	const protocol = location?.protocol === 'https:' ? 'wss:' : 'ws:';
	if (import.meta.env.DEV && location !== undefined) {
		const serverPort = import.meta.env.VITE_SERVER_PORT ?? '3000';
		return `${protocol}//${location.hostname}:${serverPort}/ws`;
	}
	return `${protocol}//${location?.host ?? 'localhost:3000'}/ws`;
};

export const reconnectDelay = (
	attempt: number,
	random = Math.random,
): number => {
	const base = Math.min(5000, 500 * 2 ** Math.max(0, attempt));
	return Math.min(5000, Math.round(base * (0.8 + random() * 0.4)));
};

const PING_INTERVAL_MS = 5000;
const STALE_TIMEOUT_MS = 15_000;

export class MultiplayerWebSocket {
	private socket: WebSocket | undefined;
	private reconnectTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
	private healthTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
	private reconnectAttempt = 0;
	private closedIntentionally = false;
	private lastMessageAt = 0;
	private readonly clientId =
		globalThis.crypto?.randomUUID?.() ?? 'browser-client';
	private readonly now: () => number;
	private readonly random: () => number;
	private readonly schedule: (
		callback: () => void,
		delay: number,
	) => ReturnType<typeof globalThis.setTimeout>;
	private readonly cancel: NonNullable<WebSocketClientOptions['clearTimeout']>;

	public constructor(private readonly options: WebSocketClientOptions) {
		this.now = options.now ?? Date.now;
		this.random = options.random ?? Math.random;
		this.schedule =
			options.setTimeout ?? globalThis.setTimeout.bind(globalThis);
		this.cancel =
			options.clearTimeout ?? globalThis.clearTimeout.bind(globalThis);
	}

	public connect(): void {
		this.closedIntentionally = false;
		this.reconnectAttempt = 0;
		this.clearReconnectTimer();
		this.open(false);
	}

	public send(message: object): void {
		if (this.socket?.readyState !== WebSocket.OPEN) return;
		this.socket.send(JSON.stringify(message));
	}

	public stopRetrying(): void {
		this.closedIntentionally = true;
		this.clearReconnectTimer();
	}

	public close(): void {
		this.stopRetrying();
		this.clearHealthTimer();
		this.socket?.close();
		this.socket = undefined;
		this.options.onStateChange('closed');
	}

	private open(isRetry: boolean): void {
		this.clearHealthTimer();
		this.options.onStateChange(isRetry ? 'reconnecting' : 'connecting');
		const socket = new WebSocket(websocketUrl());
		this.socket = socket;
		socket.addEventListener('open', () => {
			if (this.socket !== socket) return;
			this.reconnectAttempt = 0;
			this.lastMessageAt = this.now();
			this.send({
				type: 'hello',
				protocolVersion: PROTOCOL_VERSION,
				clientId: this.clientId,
			});
			this.options.onStateChange('connected');
			this.scheduleHealthCheck();
		});
		socket.addEventListener('message', (event) => {
			if (this.socket !== socket) return;
			this.lastMessageAt = this.now();
			try {
				const value: unknown = JSON.parse(String(event.data));
				if (!validateServerMessage(value)) {
					this.options.onError('The server sent an invalid message.');
					return;
				}
				this.options.onMessage(value);
			} catch {
				this.options.onError('The server sent an unreadable message.');
			}
		});
		socket.addEventListener('error', () =>
			this.options.onError('Unable to connect to the game server.'),
		);
		socket.addEventListener('close', () => {
			if (this.socket !== socket) return;
			this.socket = undefined;
			this.clearHealthTimer();
			if (!this.closedIntentionally) this.scheduleReconnect();
		});
	}

	private scheduleHealthCheck(): void {
		this.healthTimer = this.schedule(() => {
			if (this.socket?.readyState !== WebSocket.OPEN) return;
			const elapsed = this.now() - this.lastMessageAt;
			if (elapsed >= STALE_TIMEOUT_MS) {
				this.options.onStateChange('stale');
				this.socket.close(1001, 'Connection stale');
				return;
			}
			const nonce = globalThis.crypto?.randomUUID?.() ?? `${this.now()}`;
			const clientTime = this.now();
			this.send({ type: 'ping', nonce, clientTime });
			this.options.onPing?.(nonce, clientTime);
			this.scheduleHealthCheck();
		}, PING_INTERVAL_MS);
	}

	private scheduleReconnect(): void {
		if (this.closedIntentionally || this.reconnectTimer !== undefined) return;
		const attempt = this.reconnectAttempt;
		this.reconnectAttempt += 1;
		this.options.onStateChange('reconnecting');
		this.reconnectTimer = this.schedule(
			() => {
				this.reconnectTimer = undefined;
				if (!this.closedIntentionally) this.open(true);
			},
			reconnectDelay(attempt, this.random),
		);
	}

	private clearReconnectTimer(): void {
		if (this.reconnectTimer === undefined) return;
		this.cancel(this.reconnectTimer);
		this.reconnectTimer = undefined;
	}

	private clearHealthTimer(): void {
		if (this.healthTimer === undefined) return;
		this.cancel(this.healthTimer);
		this.healthTimer = undefined;
	}
}

export const pingIntervalMs = PING_INTERVAL_MS;
export const staleConnectionMs = STALE_TIMEOUT_MS;
