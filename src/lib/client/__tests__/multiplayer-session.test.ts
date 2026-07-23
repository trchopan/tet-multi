import { describe, expect, test } from 'bun:test';
import {
	canSendGameplayInput,
	countdownLabel,
} from '../multiplayer-session.svelte';

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
});
