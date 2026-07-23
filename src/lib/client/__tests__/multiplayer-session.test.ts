import { describe, expect, test } from 'bun:test';
import {
	canSendGameplayInput,
	clearReconnectToken,
	countdownLabel,
} from '../multiplayer-session.svelte';
import { reconnectDelay } from '../websocket';

describe('multiplayer session helpers', () => {
	test('renders server-time countdown labels deterministically', () => {
		expect(countdownLabel(3000)).toBe('3');
		expect(countdownLabel(2001)).toBe('3');
		expect(countdownLabel(1)).toBe('1');
		expect(countdownLabel(0)).toBe('GO');
	});

	test('only permits gameplay input during the playing phase', () => {
		expect(canSendGameplayInput('countdown')).toBe(false);
		expect(canSendGameplayInput('playing')).toBe(true);
	});

	test('uses bounded exponential reconnect delays with deterministic jitter', () => {
		expect(reconnectDelay(0, () => 0.5)).toBe(500);
		expect(reconnectDelay(1, () => 0.5)).toBe(1000);
		expect(reconnectDelay(4, () => 0.5)).toBe(5000);
		expect(reconnectDelay(4, () => 1)).toBe(5000);
	});

	test('clears a room token after definitive reconnect failure', () => {
		const values = new Map<string, string>();
		const previous = globalThis.localStorage;
		Object.defineProperty(globalThis, 'localStorage', {
			configurable: true,
			value: {
				getItem: (key: string) => values.get(key) ?? null,
				removeItem: (key: string) => values.delete(key),
			},
		});
		values.set('neon-drop:reconnect:ABC234', 'expired');
		clearReconnectToken('ABC234');
		expect(values.has('neon-drop:reconnect:ABC234')).toBe(false);
		Object.defineProperty(globalThis, 'localStorage', {
			configurable: true,
			value: previous,
		});
	});
});
