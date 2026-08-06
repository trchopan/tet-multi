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
	ArrowUp: 'up',
	ArrowDown: 'down',
	ArrowLeft: 'left',
	ArrowRight: 'right',
	a: 'button_a',
	A: 'button_a',
	s: 'button_b',
	S: 'button_b',
	z: 'button_x',
	Z: 'button_x',
	c: 'button_y',
	C: 'button_y',
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

export interface ControlBindingInfo {
	readonly action: string;
	readonly label: string;
	readonly defaultKeys: readonly string[];
}

export class UnifiedInputController {
	private readonly keyMap = new Map<string, InputAction>();
	private readonly activeActions = new Set<InputAction>();
	private readonly pressedKeyActions = new Map<
		string,
		{ action: InputAction; elapsedMs: number; dasTriggered: boolean }
	>();
	private readonly virtualActiveActions = new Map<
		InputAction,
		{ elapsedMs: number; dasTriggered: boolean }
	>();
	private horizontalOrder: string[] = [];
	private virtualHorizontalOrder: InputAction[] = [];
	private readonly target: EventTarget;
	private readonly onAction: (action: InputAction) => void;
	private readonly onStateChange?:
		((activeActions: Set<InputAction>) => void) | undefined;

	private readonly handleKeyDown = (event: Event): void => {
		const e = event as KeyboardEvent;
		if (
			typeof HTMLInputElement !== 'undefined' &&
			(e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement)
		)
			return;

		const action =
			this.keyMap.get(e.key) ??
			(e.key ? this.keyMap.get(e.key.toLowerCase()) : undefined);
		if (action === undefined) return;
		e.preventDefault();

		if (this.pressedKeyActions.has(e.key)) return;
		this.pressedKeyActions.set(e.key, {
			action,
			elapsedMs: 0,
			dasTriggered: false,
		});

		if (horizontalActions.has(action)) {
			this.horizontalOrder = this.horizontalOrder.filter((k) => k !== e.key);
			this.horizontalOrder.push(e.key);
		}

		this.updateActiveState(action, true);
		this.onAction(action);
	};

	private readonly handleKeyUp = (event: Event): void => {
		const e = event as KeyboardEvent;
		const entry = this.pressedKeyActions.get(e.key);
		if (!entry) return;

		const action = entry.action;
		this.pressedKeyActions.delete(e.key);
		this.horizontalOrder = this.horizontalOrder.filter((k) => k !== e.key);

		// Check if any other key is still producing this action
		const isStillPressedOnKey = Array.from(
			this.pressedKeyActions.values(),
		).some((item) => item.action === action);
		const isVirtualPressed = this.virtualActiveActions.has(action);

		if (!isStillPressedOnKey && !isVirtualPressed) {
			this.updateActiveState(action, false);
		}
	};

	constructor(
		controls: readonly ControlBindingInfo[],
		target: EventTarget,
		onAction: (action: InputAction) => void,
		onStateChange?: (activeActions: Set<InputAction>) => void,
		autoStartLoop = true,
	) {
		this.target = target;
		this.onAction = onAction;
		this.onStateChange = onStateChange;

		for (const binding of controls) {
			for (const key of binding.defaultKeys) {
				this.keyMap.set(key, binding.action as InputAction);
				this.keyMap.set(key.toLowerCase(), binding.action as InputAction);
			}
		}

		this.target.addEventListener(
			'keydown',
			this.handleKeyDown as EventListener,
		);
		this.target.addEventListener('keyup', this.handleKeyUp as EventListener);

		if (autoStartLoop && typeof requestAnimationFrame !== 'undefined') {
			this.startLoop();
		}
	}

	private animId: number | undefined;
	private lastFrameTime = 0;

	private readonly tickLoop = (now: number): void => {
		if (this.lastFrameTime > 0) {
			const elapsed = Math.min(now - this.lastFrameTime, 100);
			this.update(elapsed);
		}
		this.lastFrameTime = now;
		this.animId = requestAnimationFrame(this.tickLoop);
	};

	public startLoop(): void {
		if (this.animId !== undefined) return;
		this.lastFrameTime = performance.now();
		this.animId = requestAnimationFrame(this.tickLoop);
	}

	public stopLoop(): void {
		if (this.animId !== undefined) {
			cancelAnimationFrame(this.animId);
			this.animId = undefined;
		}
		this.lastFrameTime = 0;
	}

	public pressVirtualAction(action: InputAction): void {
		if (!this.virtualActiveActions.has(action)) {
			this.virtualActiveActions.set(action, {
				elapsedMs: 0,
				dasTriggered: false,
			});
			if (horizontalActions.has(action)) {
				this.virtualHorizontalOrder = this.virtualHorizontalOrder.filter(
					(a) => a !== action,
				);
				this.virtualHorizontalOrder.push(action);
			}
			this.updateActiveState(action, true);
			this.onAction(action);
		}
	}

	public releaseVirtualAction(action: InputAction): void {
		if (this.virtualActiveActions.has(action)) {
			this.virtualActiveActions.delete(action);
			if (horizontalActions.has(action)) {
				this.virtualHorizontalOrder = this.virtualHorizontalOrder.filter(
					(a) => a !== action,
				);
			}

			const isKeyActive = Array.from(this.pressedKeyActions.values()).some(
				(item) => item.action === action,
			);
			if (!isKeyActive) {
				this.updateActiveState(action, false);
			}
		}
	}

	public isActionActive(action: InputAction): boolean {
		return this.activeActions.has(action);
	}

	public getActiveActions(): Set<InputAction> {
		return new Set(this.activeActions);
	}

	private updateActiveState(action: InputAction, active: boolean): void {
		const changed = active
			? !this.activeActions.has(action) &&
				(this.activeActions.add(action), true)
			: this.activeActions.has(action) &&
				(this.activeActions.delete(action), true);

		if (changed && this.onStateChange) {
			this.onStateChange(new Set(this.activeActions));
		}
	}

	public update(elapsedMs: number): void {
		if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return;

		// 1. Keyboard horizontal DAS/ARR
		const horizontalKey = this.horizontalOrder.at(-1);
		if (horizontalKey !== undefined) {
			const horizontal = this.pressedKeyActions.get(horizontalKey);
			if (horizontal !== undefined) {
				horizontal.elapsedMs += elapsedMs;
				const threshold = horizontal.dasTriggered ? ARR_MS : DAS_MS;
				if (horizontal.elapsedMs >= threshold) {
					this.onAction(horizontal.action);
					horizontal.elapsedMs -= threshold;
					horizontal.dasTriggered = true;
					while (horizontal.elapsedMs >= ARR_MS) {
						horizontal.elapsedMs -= ARR_MS;
						this.onAction(horizontal.action);
					}
				}
			}
		}

		// 2. Virtual horizontal DAS/ARR
		const virtualHorizontalAction = this.virtualHorizontalOrder.at(-1);
		if (virtualHorizontalAction !== undefined) {
			const virtualHorizontal = this.virtualActiveActions.get(
				virtualHorizontalAction,
			);
			if (virtualHorizontal !== undefined) {
				virtualHorizontal.elapsedMs += elapsedMs;
				const threshold = virtualHorizontal.dasTriggered ? ARR_MS : DAS_MS;
				if (virtualHorizontal.elapsedMs >= threshold) {
					this.onAction(virtualHorizontalAction);
					virtualHorizontal.elapsedMs -= threshold;
					virtualHorizontal.dasTriggered = true;
					while (virtualHorizontal.elapsedMs >= ARR_MS) {
						virtualHorizontal.elapsedMs -= ARR_MS;
						this.onAction(virtualHorizontalAction);
					}
				}
			}
		}

		// 3. Keyboard soft drop
		for (const pressed of this.pressedKeyActions.values()) {
			if (pressed.action !== 'down') continue;
			pressed.elapsedMs += elapsedMs;
			while (pressed.elapsedMs >= SOFT_DROP_MS) {
				pressed.elapsedMs -= SOFT_DROP_MS;
				this.onAction(pressed.action);
			}
		}

		// 4. Virtual soft drop
		const virtualDown = this.virtualActiveActions.get('down');
		if (virtualDown !== undefined) {
			virtualDown.elapsedMs += elapsedMs;
			while (virtualDown.elapsedMs >= SOFT_DROP_MS) {
				virtualDown.elapsedMs -= SOFT_DROP_MS;
				this.onAction('down');
			}
		}
	}

	public dispose(): void {
		this.stopLoop();
		this.target.removeEventListener(
			'keydown',
			this.handleKeyDown as EventListener,
		);
		this.target.removeEventListener('keyup', this.handleKeyUp as EventListener);
		this.pressedKeyActions.clear();
		this.virtualActiveActions.clear();
		this.horizontalOrder = [];
		this.virtualHorizontalOrder = [];
		this.activeActions.clear();
		if (this.onStateChange) {
			this.onStateChange(new Set());
		}
	}
}
