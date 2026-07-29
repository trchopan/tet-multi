import type { InputAction } from '../../shared/types';

export const DAS_MS = 140;
export const ARR_MS = 40;
export const SOFT_DROP_MS = 35;
export const SWIPE_MIN_DISTANCE = 32;
export const SWIPE_AXIS_RATIO = 1.25;
export const DOUBLE_SWIPE_MS = 300;

export interface KeyboardEventTarget {
	addEventListener(
		type: 'keydown' | 'keyup',
		listener: (event: Event) => void,
	): void;
	removeEventListener(
		type: 'keydown' | 'keyup',
		listener: (event: Event) => void,
	): void;
}

export interface PointerEventTarget {
	addEventListener(
		type: 'pointerdown' | 'pointerup' | 'pointercancel' | 'lostpointercapture',
		listener: (event: Event) => void,
	): void;
	removeEventListener(
		type: 'pointerdown' | 'pointerup' | 'pointercancel' | 'lostpointercapture',
		listener: (event: Event) => void,
	): void;
	setPointerCapture(pointerId: number): void;
	hasPointerCapture(pointerId: number): boolean;
	releasePointerCapture(pointerId: number): void;
	focus(): void;
}

const keyActions: Readonly<Record<string, InputAction>> = {
	ArrowLeft: 'left',
	a: 'left',
	A: 'left',
	ArrowRight: 'right',
	d: 'right',
	D: 'right',
	ArrowDown: 'down',
	s: 'down',
	S: 'down',
	' ': 'button_a',
	w: 'button_a',
	W: 'button_a',
	ArrowUp: 'button_x',
	x: 'button_x',
	X: 'button_x',
	z: 'button_b',
	Z: 'button_b',
	q: 'button_b',
	Q: 'button_b',
	c: 'button_y',
	C: 'button_y',
	Shift: 'button_y',
	j: 'button_a',
	J: 'button_a',
	k: 'button_b',
	K: 'button_b',
	u: 'button_x',
	U: 'button_x',
	i: 'button_y',
	I: 'button_y',
};

const horizontalActions = new Set<InputAction>(['left', 'right']);

export const mapKeyToAction = (key: string): InputAction | undefined =>
	keyActions[key];

interface PressedKey {
	action: InputAction;
	elapsedMs: number;
}

export class KeyboardInput {
	private readonly pressed = new Map<string, PressedKey>();
	private horizontalOrder: string[] = [];
	private readonly handleKeyDown = (event: Event): void => {
		const keyboardEvent = event as KeyboardEvent;
		const action = mapKeyToAction(keyboardEvent.key);
		if (action === undefined) return;
		keyboardEvent.preventDefault();
		if (this.pressed.has(keyboardEvent.key)) return;
		this.pressed.set(keyboardEvent.key, { action, elapsedMs: 0 });
		if (horizontalActions.has(action)) {
			this.horizontalOrder = this.horizontalOrder.filter(
				(key) => key !== keyboardEvent.key,
			);
			this.horizontalOrder.push(keyboardEvent.key);
		}
		this.emit(action);
	};
	private readonly handleKeyUp = (event: Event): void => {
		const keyboardEvent = event as KeyboardEvent;
		if (!this.pressed.delete(keyboardEvent.key)) return;
		this.horizontalOrder = this.horizontalOrder.filter(
			(key) => key !== keyboardEvent.key,
		);
	};

	public constructor(
		target: KeyboardEventTarget,
		private readonly onAction: (action: InputAction) => void,
	) {
		target.addEventListener('keydown', this.handleKeyDown);
		target.addEventListener('keyup', this.handleKeyUp);
		this.target = target;
	}

	private readonly target: KeyboardEventTarget;

	private emit(action: InputAction): void {
		this.onAction(action);
	}

	public update(elapsedMs: number): void {
		if (!Number.isFinite(elapsedMs) || elapsedMs < 0)
			throw new RangeError('Input elapsed time must be non-negative');
		const horizontalKey = this.horizontalOrder.at(-1);
		if (horizontalKey !== undefined) {
			const horizontal = this.pressed.get(horizontalKey);
			if (horizontal !== undefined) {
				horizontal.elapsedMs += elapsedMs;
				if (horizontal.elapsedMs >= DAS_MS) {
					this.emit(horizontal.action);
					horizontal.elapsedMs -= DAS_MS;
					while (horizontal.elapsedMs >= ARR_MS) {
						horizontal.elapsedMs -= ARR_MS;
						this.emit(horizontal.action);
					}
				}
			}
		}
		for (const pressed of this.pressed.values()) {
			if (pressed.action !== 'down') continue;
			pressed.elapsedMs += elapsedMs;
			while (pressed.elapsedMs >= SOFT_DROP_MS) {
				pressed.elapsedMs -= SOFT_DROP_MS;
				this.emit(pressed.action);
			}
		}
	}

	public dispose(): void {
		this.target.removeEventListener('keydown', this.handleKeyDown);
		this.target.removeEventListener('keyup', this.handleKeyUp);
		this.pressed.clear();
		this.horizontalOrder = [];
	}
}

export class SwipeInput {
	private readonly target: PointerEventTarget;
	private pointerId: number | undefined;
	private startX = 0;
	private startY = 0;
	private lastDownSwipeAt: number | undefined;

	private readonly handlePointerDown = (event: Event): void => {
		const pointerEvent = event as PointerEvent;
		if (
			this.pointerId !== undefined ||
			pointerEvent.pointerType !== 'touch' ||
			!pointerEvent.isPrimary
		)
			return;
		pointerEvent.preventDefault();
		this.target.focus();
		this.pointerId = pointerEvent.pointerId;
		this.startX = pointerEvent.clientX;
		this.startY = pointerEvent.clientY;
		this.target.setPointerCapture(pointerEvent.pointerId);
	};

	private readonly handlePointerUp = (event: Event): void => {
		const pointerEvent = event as PointerEvent;
		if (pointerEvent.pointerId !== this.pointerId) return;
		pointerEvent.preventDefault();
		const dx = pointerEvent.clientX - this.startX;
		const dy = pointerEvent.clientY - this.startY;
		this.clearPointer(pointerEvent.pointerId);

		const distanceX = Math.abs(dx);
		const distanceY = Math.abs(dy);
		if (Math.max(distanceX, distanceY) < SWIPE_MIN_DISTANCE) {
			this.lastDownSwipeAt = undefined;
			return;
		}

		if (distanceX >= distanceY * SWIPE_AXIS_RATIO) {
			this.lastDownSwipeAt = undefined;
			this.emit(dx < 0 ? 'left' : 'right');
			return;
		}
		if (distanceY < distanceX * SWIPE_AXIS_RATIO) {
			this.lastDownSwipeAt = undefined;
			return;
		}
		if (dy < 0) {
			this.lastDownSwipeAt = undefined;
			this.emit('button_x');
			return;
		}

		const now = this.now();
		const isDoubleSwipe =
			this.lastDownSwipeAt !== undefined &&
			now >= this.lastDownSwipeAt &&
			now - this.lastDownSwipeAt <= DOUBLE_SWIPE_MS;
		this.lastDownSwipeAt = isDoubleSwipe ? undefined : now;
		this.emit(isDoubleSwipe ? 'button_a' : 'down');
	};

	private readonly handlePointerCancel = (event: Event): void => {
		const pointerEvent = event as PointerEvent;
		if (pointerEvent.pointerId !== this.pointerId) return;
		this.clearPointer(pointerEvent.pointerId);
		this.lastDownSwipeAt = undefined;
	};

	private readonly handleLostPointerCapture = (event: Event): void => {
		const pointerEvent = event as PointerEvent;
		if (pointerEvent.pointerId !== this.pointerId) return;
		this.pointerId = undefined;
		this.lastDownSwipeAt = undefined;
	};

	public constructor(
		target: PointerEventTarget,
		private readonly onAction: (action: InputAction) => void,
		private readonly now: () => number = () => performance.now(),
	) {
		this.target = target;
		target.addEventListener('pointerdown', this.handlePointerDown);
		target.addEventListener('pointerup', this.handlePointerUp);
		target.addEventListener('pointercancel', this.handlePointerCancel);
		target.addEventListener(
			'lostpointercapture',
			this.handleLostPointerCapture,
		);
	}

	private emit(action: InputAction): void {
		this.onAction(action);
	}

	private clearPointer(pointerId: number): void {
		if (this.target.hasPointerCapture(pointerId))
			this.target.releasePointerCapture(pointerId);
		this.pointerId = undefined;
	}

	public dispose(): void {
		this.target.removeEventListener('pointerdown', this.handlePointerDown);
		this.target.removeEventListener('pointerup', this.handlePointerUp);
		this.target.removeEventListener('pointercancel', this.handlePointerCancel);
		this.target.removeEventListener(
			'lostpointercapture',
			this.handleLostPointerCapture,
		);
		if (this.pointerId !== undefined) this.clearPointer(this.pointerId);
		this.lastDownSwipeAt = undefined;
	}
}

export class PluginInputDispatcher {
	private readonly keyMap = new Map<string, InputAction>();
	private readonly target: EventTarget;
	private readonly onAction: (action: InputAction) => void;

	private readonly handleKeyDown = (event: Event): void => {
		const e = event as KeyboardEvent;
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement
		)
			return;
		const action =
			this.keyMap.get(e.key) ?? this.keyMap.get(e.key.toLowerCase());
		if (action === undefined) return;
		e.preventDefault();
		this.onAction(action);
	};

	constructor(
		controls: readonly { action: string; defaultKeys: readonly string[] }[],
		target: EventTarget,
		onAction: (action: InputAction) => void,
	) {
		this.target = target;
		this.onAction = onAction;
		for (const binding of controls) {
			for (const key of binding.defaultKeys) {
				this.keyMap.set(key, binding.action as InputAction);
				this.keyMap.set(key.toLowerCase(), binding.action as InputAction);
			}
		}
		this.target.addEventListener('keydown', this.handleKeyDown);
	}

	public dispose(): void {
		this.target.removeEventListener('keydown', this.handleKeyDown);
	}
}
