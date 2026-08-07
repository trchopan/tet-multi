import { afterEach, describe, expect, test } from 'bun:test';
import {
	MultiplayerWebSocket,
	type ConnectionState,
} from '$/lib/client/websocket';

type Listener = (event: unknown) => void;
type Timer = { callback: () => void; delay: number; cancelled: boolean };

class FakeWebSocket {
	static instances: FakeWebSocket[] = [];
	static readonly OPEN = 1;
	readonly messages: string[] = [];
	readyState = 0;
	private readonly listeners = new Map<string, Listener[]>();

	constructor(readonly url: string) {
		FakeWebSocket.instances.push(this);
	}

	addEventListener(type: string, listener: Listener): void {
		this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
	}

	send(message: string): void {
		this.messages.push(message);
	}

	open(): void {
		this.readyState = FakeWebSocket.OPEN;
		this.emit('open', {});
	}

	close(): void {
		this.readyState = 3;
		this.emit('close', {});
	}

	private emit(type: string, event: unknown): void {
		for (const listener of this.listeners.get(type) ?? []) listener(event);
	}
}

const originalWebSocket = globalThis.WebSocket;

afterEach(() => {
	Object.defineProperty(globalThis, 'WebSocket', {
		configurable: true,
		value: originalWebSocket,
	});
	FakeWebSocket.instances = [];
});

describe('resilient WebSocket transport', () => {
	test('retries an unexpected close with the next backoff delay', () => {
		Object.defineProperty(globalThis, 'WebSocket', {
			configurable: true,
			value: FakeWebSocket,
		});
		const timers: Timer[] = [];
		const states: ConnectionState[] = [];
		const transport = new MultiplayerWebSocket({
			onMessage: () => undefined,
			onStateChange: (state) => states.push(state),
			onError: () => undefined,
			random: () => 0.5,
			setTimeout: (callback, delay) => {
				const timer = { callback, delay, cancelled: false };
				timers.push(timer);
				return timer as unknown as ReturnType<typeof globalThis.setTimeout>;
			},
			clearTimeout: (timer) => {
				(timer as unknown as Timer).cancelled = true;
			},
		});

		transport.connect();
		const first = FakeWebSocket.instances[0]!;
		first.open();
		first.close();
		const retry = timers.find(
			(timer) => !timer.cancelled && timer.delay === 500,
		);
		expect(retry).toBeDefined();
		retry?.callback();
		expect(FakeWebSocket.instances).toHaveLength(2);
		expect(states).toContain('reconnecting');
	});

	test('intentional close does not schedule a retry', () => {
		Object.defineProperty(globalThis, 'WebSocket', {
			configurable: true,
			value: FakeWebSocket,
		});
		const timers: Timer[] = [];
		const transport = new MultiplayerWebSocket({
			onMessage: () => undefined,
			onStateChange: () => undefined,
			onError: () => undefined,
			setTimeout: (callback, delay) => {
				const timer = { callback, delay, cancelled: false };
				timers.push(timer);
				return timer as unknown as ReturnType<typeof globalThis.setTimeout>;
			},
			clearTimeout: () => undefined,
		});
		transport.connect();
		transport.close();
		expect(timers).toHaveLength(0);
	});
});
