import { describe, expect, test } from 'bun:test';
import type { InputAction } from '../../../shared/types';
import {
	KeyboardInput,
	mapKeyToAction,
	SwipeInput,
	type PointerEventTarget,
} from '../input';

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

class FakePointerTarget implements PointerEventTarget {
	private listeners = new Map<
		'pointerdown' | 'pointerup' | 'pointercancel' | 'lostpointercapture',
		Set<(event: Event) => void>
	>();
	private capturedPointers = new Set<number>();
	public focused = false;

	public addEventListener(
		type: 'pointerdown' | 'pointerup' | 'pointercancel' | 'lostpointercapture',
		listener: (event: Event) => void,
	): void {
		const listeners = this.listeners.get(type) ?? new Set();
		listeners.add(listener);
		this.listeners.set(type, listeners);
	}

	public removeEventListener(
		type: 'pointerdown' | 'pointerup' | 'pointercancel' | 'lostpointercapture',
		listener: (event: Event) => void,
	): void {
		this.listeners.get(type)?.delete(listener);
	}

	public setPointerCapture(pointerId: number): void {
		this.capturedPointers.add(pointerId);
	}

	public hasPointerCapture(pointerId: number): boolean {
		return this.capturedPointers.has(pointerId);
	}

	public releasePointerCapture(pointerId: number): void {
		this.capturedPointers.delete(pointerId);
	}

	public focus(): void {
		this.focused = true;
	}

	public dispatch(
		type: 'pointerdown' | 'pointerup' | 'pointercancel' | 'lostpointercapture',
		pointerId: number,
		clientX: number,
		clientY: number,
		options: { pointerType?: string; isPrimary?: boolean } = {},
	): boolean {
		let prevented = false;
		const event = {
			pointerId,
			clientX,
			clientY,
			pointerType: options.pointerType ?? 'touch',
			isPrimary: options.isPrimary ?? true,
			preventDefault: () => {
				prevented = true;
			},
		} as unknown as Event;
		for (const listener of this.listeners.get(type) ?? []) listener(event);
		return prevented;
	}

	public losePointerCapture(pointerId: number): void {
		this.capturedPointers.delete(pointerId);
		this.dispatch('lostpointercapture', pointerId, 0, 0);
	}
}

describe('local keyboard input', () => {
	test('maps primary and alternate controls', () => {
		const expected: Array<[string, InputAction]> = [
			['ArrowLeft', 'left'],
			['a', 'left'],
			['ArrowRight', 'right'],
			['d', 'right'],
			['ArrowDown', 'down'],
			['s', 'down'],
			[' ', 'button_a'],
			['w', 'button_a'],
			['ArrowUp', 'button_x'],
			['x', 'button_x'],
			['z', 'button_b'],
			['q', 'button_b'],
			['c', 'button_y'],
			['Shift', 'button_y'],
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
		expect(actions).toEqual(['button_a']);
		input.dispose();
		expect(target.dispatch('keydown', 'x')).toBe(false);
	});

	test('generates DAS, ARR, and soft-drop repeats', () => {
		const target = new FakeTarget();
		const actions: InputAction[] = [];
		const input = new KeyboardInput(target, (action) => actions.push(action));
		target.dispatch('keydown', 'ArrowRight');
		expect(actions).toEqual(['right']);
		input.update(139);
		expect(actions).toHaveLength(1);
		input.update(41);
		expect(actions).toEqual(['right', 'right', 'right']);
		target.dispatch('keyup', 'ArrowRight');
		target.dispatch('keydown', 'ArrowDown');
		input.update(35);
		expect(actions.at(-1)).toBe('down');
		input.dispose();
	});

	test('most recently pressed horizontal direction wins', () => {
		const target = new FakeTarget();
		const actions: InputAction[] = [];
		const input = new KeyboardInput(target, (action) => actions.push(action));
		target.dispatch('keydown', 'ArrowLeft');
		target.dispatch('keydown', 'ArrowRight');
		input.update(140);
		expect(actions.at(-1)).toBe('right');
		input.dispose();
	});
});

describe('local swipe input', () => {
	const swipe = (
		target: FakePointerTarget,
		start: [number, number],
		end: [number, number],
		pointerId = 1,
	): void => {
		target.dispatch('pointerdown', pointerId, ...start);
		target.dispatch('pointerup', pointerId, ...end);
	};

	test('maps dominant swipes to gameplay actions', () => {
		const target = new FakePointerTarget();
		const actions: InputAction[] = [];
		const input = new SwipeInput(target, (action) => actions.push(action));

		swipe(target, [100, 100], [40, 100]);
		swipe(target, [100, 100], [160, 100]);
		swipe(target, [100, 100], [100, 40]);
		swipe(target, [100, 100], [100, 160]);

		expect(actions).toEqual([
			'left',
			'right',
			'button_x',
			'down',
		]);
		expect(target.focused).toBe(true);
		input.dispose();
	});

	test('accepts only primary touch pointers', () => {
		const target = new FakePointerTarget();
		const actions: InputAction[] = [];
		const input = new SwipeInput(target, (action) => actions.push(action));

		swipe(target, [100, 100], [40, 100], 1);
		target.dispatch('pointerdown', 2, 100, 100, {
			pointerType: 'mouse',
		});
		target.dispatch('pointerup', 2, 40, 100, { pointerType: 'mouse' });
		target.dispatch('pointerdown', 3, 100, 100, {
			isPrimary: false,
		});
		target.dispatch('pointerup', 3, 40, 100, { isPrimary: false });

		expect(actions).toEqual(['left']);
		input.dispose();
	});

	test('ignores taps and ambiguous diagonal gestures', () => {
		const target = new FakePointerTarget();
		const actions: InputAction[] = [];
		const input = new SwipeInput(target, (action) => actions.push(action));

		expect(target.dispatch('pointerdown', 1, 100, 100)).toBe(true);
		target.dispatch('pointerup', 1, 120, 110);
		swipe(target, [100, 100], [150, 145]);

		expect(actions).toEqual([]);
		input.dispose();
	});

	test('turns two downward swipes within 300 ms into a hard drop', () => {
		const target = new FakePointerTarget();
		const actions: InputAction[] = [];
		let now = 1_000;
		const input = new SwipeInput(
			target,
			(action) => actions.push(action),
			() => now,
		);

		swipe(target, [100, 100], [100, 160]);
		now = 1_300;
		swipe(target, [100, 100], [100, 160]);
		now = 1_301;
		swipe(target, [100, 100], [100, 160]);

		expect(actions).toEqual(['down', 'button_a', 'down']);
		input.dispose();
	});

	test('does not combine downward swipes after the double-swipe window', () => {
		const target = new FakePointerTarget();
		const actions: InputAction[] = [];
		let now = 1_000;
		const input = new SwipeInput(
			target,
			(action) => actions.push(action),
			() => now,
		);

		swipe(target, [100, 100], [100, 160]);
		now = 1_301;
		swipe(target, [100, 100], [100, 160]);

		expect(actions).toEqual(['down', 'down']);
		input.dispose();
	});

	test('cancellation resets a pending double-swipe sequence', () => {
		const target = new FakePointerTarget();
		const actions: InputAction[] = [];
		let now = 1_000;
		const input = new SwipeInput(
			target,
			(action) => actions.push(action),
			() => now,
		);

		swipe(target, [100, 100], [100, 160]);
		target.dispatch('pointerdown', 2, 100, 100);
		target.dispatch('pointercancel', 2, 100, 100);
		now = 1_100;
		swipe(target, [100, 100], [100, 160], 3);

		expect(actions).toEqual(['down', 'down']);
		input.dispose();
	});

	test('requires consecutive downward swipes for a hard drop', () => {
		const target = new FakePointerTarget();
		const actions: InputAction[] = [];
		let now = 1_000;
		const input = new SwipeInput(
			target,
			(action) => actions.push(action),
			() => now,
		);

		swipe(target, [100, 100], [100, 160]);
		now = 1_100;
		swipe(target, [100, 100], [40, 100]);
		now = 1_200;
		swipe(target, [100, 100], [100, 160]);

		expect(actions).toEqual(['down', 'left', 'down']);
		input.dispose();
	});

	test('recovers from lost capture and releases capture on cancellation', () => {
		const target = new FakePointerTarget();
		const actions: InputAction[] = [];
		const input = new SwipeInput(target, (action) => actions.push(action));

		target.dispatch('pointerdown', 1, 100, 100);
		target.losePointerCapture(1);
		swipe(target, [100, 100], [40, 100], 2);
		target.dispatch('pointerdown', 3, 100, 100);
		target.dispatch('pointercancel', 1, 100, 100);
		target.dispatch('pointercancel', 3, 100, 100);
		expect(target.hasPointerCapture(3)).toBe(false);
		target.dispatch('pointerdown', 4, 100, 100);
		expect(target.hasPointerCapture(4)).toBe(true);
		input.dispose();
		expect(target.hasPointerCapture(4)).toBe(false);

		expect(actions).toEqual(['left']);
	});
});
