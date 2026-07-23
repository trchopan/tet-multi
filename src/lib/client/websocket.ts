import { validateServerMessage } from '../../shared/protocol';
import { PROTOCOL_VERSION } from '../../shared/constants';
import type { ServerMessage } from '../../shared/types';

export type ConnectionState = 'connecting' | 'connected' | 'closed';

export interface WebSocketClientOptions {
	onMessage: (message: ServerMessage) => void;
	onStateChange: (state: ConnectionState) => void;
	onError: (message: string) => void;
}

const websocketUrl = (): string => {
	const protocol = globalThis.location?.protocol === 'https:' ? 'wss:' : 'ws:';
	return `${protocol}//${globalThis.location?.host ?? 'localhost:3000'}/ws`;
};

export class MultiplayerWebSocket {
	private socket: WebSocket | undefined;
	private readonly clientId =
		globalThis.crypto?.randomUUID?.() ?? 'browser-client';

	public constructor(private readonly options: WebSocketClientOptions) {}

	public connect(): void {
		this.close();
		this.options.onStateChange('connecting');
		const socket = new WebSocket(websocketUrl());
		this.socket = socket;
		socket.addEventListener('open', () => {
			this.send({
				type: 'hello',
				protocolVersion: PROTOCOL_VERSION,
				clientId: this.clientId,
			});
			this.options.onStateChange('connected');
		});
		socket.addEventListener('message', (event) => {
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
			if (this.socket === socket) this.options.onStateChange('closed');
		});
	}

	public send(message: object): void {
		if (this.socket?.readyState !== WebSocket.OPEN) return;
		this.socket.send(JSON.stringify(message));
	}

	public close(): void {
		this.socket?.close();
		this.socket = undefined;
	}
}
