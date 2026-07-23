import type { InputAction } from '../../shared/types';

export const DAS_MS = 140;
export const ARR_MS = 40;
export const SOFT_DROP_MS = 35;

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

const keyActions: Readonly<Record<string, InputAction>> = {
	ArrowLeft: 'move_left',
	a: 'move_left',
	A: 'move_left',
	ArrowRight: 'move_right',
	d: 'move_right',
	D: 'move_right',
	ArrowDown: 'soft_drop',
	s: 'soft_drop',
	S: 'soft_drop',
	' ': 'hard_drop',
	w: 'hard_drop',
	W: 'hard_drop',
	ArrowUp: 'rotate_cw',
	x: 'rotate_cw',
	X: 'rotate_cw',
	z: 'rotate_ccw',
	Z: 'rotate_ccw',
	q: 'rotate_ccw',
	Q: 'rotate_ccw',
	c: 'hold',
	C: 'hold',
	Shift: 'hold',
};

const horizontalActions = new Set<InputAction>(['move_left', 'move_right']);

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
			if (pressed.action !== 'soft_drop') continue;
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
