import { describe, expect, test } from 'bun:test';
import type { InputAction } from '../../../shared/types';
import { KeyboardInput, mapKeyToAction } from '../input';

class FakeTarget {
	private listeners = new Map<
		'keydown' | 'keyup',
		Set<(event: Event) => void>
	>();

	public addEventListener(
		type: 'keydown' | 'keyup',
		listener: (event: Event) => void,
	): void {
		const listeners = this.listeners.get(type) ?? new Set();
		listeners.add(listener);
		this.listeners.set(type, listeners);
	}

	public removeEventListener(
		type: 'keydown' | 'keyup',
		listener: (event: Event) => void,
	): void {
		this.listeners.get(type)?.delete(listener);
	}

	public dispatch(type: 'keydown' | 'keyup', key: string): boolean {
		let prevented = false;
		const event = {
			key,
			preventDefault: () => {
				prevented = true;
			},
		} as unknown as Event;
		for (const listener of this.listeners.get(type) ?? []) listener(event);
		return prevented;
	}
}

describe('local keyboard input', () => {
	test('maps primary and alternate controls', () => {
		const expected: Array<[string, InputAction]> = [
			['ArrowLeft', 'move_left'],
			['a', 'move_left'],
			['ArrowRight', 'move_right'],
			['d', 'move_right'],
			['ArrowDown', 'soft_drop'],
			['s', 'soft_drop'],
			[' ', 'hard_drop'],
			['w', 'hard_drop'],
			['ArrowUp', 'rotate_cw'],
			['x', 'rotate_cw'],
			['z', 'rotate_ccw'],
			['q', 'rotate_ccw'],
			['c', 'hold'],
			['Shift', 'hold'],
		];
		for (const [key, action] of expected)
			expect(mapKeyToAction(key)).toBe(action);
	});

	test('emits edge actions immediately and prevents scrolling', () => {
		const target = new FakeTarget();
		const actions: InputAction[] = [];
		const input = new KeyboardInput(target, (action) => actions.push(action));
		expect(target.dispatch('keydown', ' ')).toBe(true);
		expect(target.dispatch('keydown', ' ')).toBe(true);
		expect(actions).toEqual(['hard_drop']);
		input.dispose();
		expect(target.dispatch('keydown', 'x')).toBe(false);
	});

	test('generates DAS, ARR, and soft-drop repeats', () => {
		const target = new FakeTarget();
		const actions: InputAction[] = [];
		const input = new KeyboardInput(target, (action) => actions.push(action));
		target.dispatch('keydown', 'ArrowRight');
		expect(actions).toEqual(['move_right']);
		input.update(139);
		expect(actions).toHaveLength(1);
		input.update(41);
		expect(actions).toEqual(['move_right', 'move_right', 'move_right']);
		target.dispatch('keyup', 'ArrowRight');
		target.dispatch('keydown', 'ArrowDown');
		input.update(35);
		expect(actions.at(-1)).toBe('soft_drop');
		input.dispose();
	});

	test('most recently pressed horizontal direction wins', () => {
		const target = new FakeTarget();
		const actions: InputAction[] = [];
		const input = new KeyboardInput(target, (action) => actions.push(action));
		target.dispatch('keydown', 'ArrowLeft');
		target.dispatch('keydown', 'ArrowRight');
		input.update(140);
		expect(actions.at(-1)).toBe('move_right');
		input.dispose();
	});
});
