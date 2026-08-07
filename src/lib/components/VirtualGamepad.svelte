<script lang="ts">
	import type { GameControlBinding } from '$/games/types';
	import type { InputAction } from '$/shared/types';

	let {
		controls = [],
		onAction,
		onReleaseAction,
		activeActions = new Set<InputAction>(),
		mode = 'fixed-dock',
		onClose,
	}: {
		controls?: readonly GameControlBinding[] | undefined;
		onAction: (action: InputAction) => void;
		onReleaseAction?: ((action: InputAction) => void) | undefined;
		activeActions?: Set<InputAction> | undefined;
		mode?: 'fixed-dock' | 'inline' | undefined;
		onClose?: (() => void) | undefined;
	} = $props();

	let hoveredAction = $state<string | undefined>(undefined);

	// Helper to find label for action
	const getActionLabel = (actionName: string): string => {
		const found = controls.find((c) => c.action === actionName);
		return found ? found.label : actionName;
	};

	const vibrate = (): void => {
		if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
			try {
				navigator.vibrate(10);
			} catch {
				// Ignore if blocked by browser policy
			}
		}
	};

	const handlePress = (action: InputAction, event: PointerEvent): void => {
		event.preventDefault();
		event.stopPropagation();
		hoveredAction = action;
		vibrate();
		onAction(action);
	};

	const handleRelease = (action: InputAction, event: PointerEvent): void => {
		event.preventDefault();
		event.stopPropagation();
		hoveredAction = undefined;
		if (onReleaseAction) {
			onReleaseAction(action);
		}
	};
</script>

<div
	class="virtual-gamepad"
	class:fixed-dock={mode === 'fixed-dock'}
	class:inline={mode === 'inline'}
	aria-label="Arcade Virtual Gamepad Controller"
>
	<!-- Floating Tooltip / Status Header -->
	<header class="controller-bar">
		<div class="active-action-tooltip">
			{#if hoveredAction}
				<span class="tooltip-badge pulse">{getActionLabel(hoveredAction)}</span>
			{:else}
				<span class="tooltip-hint">🎮 Touch or Keyboard Input</span>
			{/if}
		</div>
		{#if onClose}
			<button
				type="button"
				class="close-btn"
				onclick={onClose}
				aria-label="Hide Virtual Controller"
				title="Hide Controller"
			>
				✕
			</button>
		{/if}
	</header>

	<div class="pad-layout">
		<!-- Left Thumb Zone: D-Pad -->
		<div class="dpad-zone">
			<div class="dpad-cross-3d">
				<!-- Up -->
				<button
					type="button"
					class="dpad-btn dpad-up"
					class:active={activeActions.has('up')}
					aria-label={`D-Pad Up: ${getActionLabel('up')}`}
					title={getActionLabel('up')}
					onpointerdown={(e) => handlePress('up', e)}
					onpointerup={(e) => handleRelease('up', e)}
					onpointerleave={(e) => handleRelease('up', e)}
					oncontextmenu={(e) => e.preventDefault()}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true"
						><path d="M12 4l-7 8h14l-7-8z" fill="currentColor" /></svg
					>
				</button>

				<!-- Left -->
				<button
					type="button"
					class="dpad-btn dpad-left"
					class:active={activeActions.has('left')}
					aria-label={`D-Pad Left: ${getActionLabel('left')}`}
					title={getActionLabel('left')}
					onpointerdown={(e) => handlePress('left', e)}
					onpointerup={(e) => handleRelease('left', e)}
					onpointerleave={(e) => handleRelease('left', e)}
					oncontextmenu={(e) => e.preventDefault()}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true"
						><path d="M4 12l8-7v14l-8-7z" fill="currentColor" /></svg
					>
				</button>

				<!-- Center Core -->
				<div class="dpad-core"></div>

				<!-- Right -->
				<button
					type="button"
					class="dpad-btn dpad-right"
					class:active={activeActions.has('right')}
					aria-label={`D-Pad Right: ${getActionLabel('right')}`}
					title={getActionLabel('right')}
					onpointerdown={(e) => handlePress('right', e)}
					onpointerup={(e) => handleRelease('right', e)}
					onpointerleave={(e) => handleRelease('right', e)}
					oncontextmenu={(e) => e.preventDefault()}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true"
						><path d="M20 12l-8-7v14l8-7z" fill="currentColor" /></svg
					>
				</button>

				<!-- Down -->
				<button
					type="button"
					class="dpad-btn dpad-down"
					class:active={activeActions.has('down')}
					aria-label={`D-Pad Down: ${getActionLabel('down')}`}
					title={getActionLabel('down')}
					onpointerdown={(e) => handlePress('down', e)}
					onpointerup={(e) => handleRelease('down', e)}
					onpointerleave={(e) => handleRelease('down', e)}
					oncontextmenu={(e) => e.preventDefault()}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true"
						><path d="M12 20l-7-8h14l-7 8z" fill="currentColor" /></svg
					>
				</button>
			</div>
		</div>

		<!-- Right Thumb Zone: ABXY Action Diamond -->
		<div class="abxy-zone">
			<div class="abxy-diamond-3d">
				<!-- Y Button (Top - Gold) -->
				<button
					type="button"
					class="abxy-btn btn-y"
					class:active={activeActions.has('button_y')}
					aria-label={`Button Y: ${getActionLabel('button_y')}`}
					title={getActionLabel('button_y')}
					onpointerdown={(e) => handlePress('button_y', e)}
					onpointerup={(e) => handleRelease('button_y', e)}
					onpointerleave={(e) => handleRelease('button_y', e)}
					oncontextmenu={(e) => e.preventDefault()}
				>
					<span class="btn-badge">Y</span>
				</button>

				<!-- X Button (Left - Sapphire) -->
				<button
					type="button"
					class="abxy-btn btn-x"
					class:active={activeActions.has('button_x')}
					aria-label={`Button X: ${getActionLabel('button_x')}`}
					title={getActionLabel('button_x')}
					onpointerdown={(e) => handlePress('button_x', e)}
					onpointerup={(e) => handleRelease('button_x', e)}
					onpointerleave={(e) => handleRelease('button_x', e)}
					oncontextmenu={(e) => e.preventDefault()}
				>
					<span class="btn-badge">X</span>
				</button>

				<!-- B Button (Right - Crimson) -->
				<button
					type="button"
					class="abxy-btn btn-b"
					class:active={activeActions.has('button_b')}
					aria-label={`Button B: ${getActionLabel('button_b')}`}
					title={getActionLabel('button_b')}
					onpointerdown={(e) => handlePress('button_b', e)}
					onpointerup={(e) => handleRelease('button_b', e)}
					onpointerleave={(e) => handleRelease('button_b', e)}
					oncontextmenu={(e) => e.preventDefault()}
				>
					<span class="btn-badge">B</span>
				</button>

				<!-- A Button (Bottom - Emerald) -->
				<button
					type="button"
					class="abxy-btn btn-a"
					class:active={activeActions.has('button_a')}
					aria-label={`Button A: ${getActionLabel('button_a')}`}
					title={getActionLabel('button_a')}
					onpointerdown={(e) => handlePress('button_a', e)}
					onpointerup={(e) => handleRelease('button_a', e)}
					onpointerleave={(e) => handleRelease('button_a', e)}
					oncontextmenu={(e) => e.preventDefault()}
				>
					<span class="btn-badge">A</span>
				</button>
			</div>
		</div>
	</div>
</div>

<style>
	.virtual-gamepad {
		width: 100%;
		display: flex;
		flex-direction: column;
		background: rgba(11, 13, 23, 0.92);
		border: 1px solid rgba(255, 255, 255, 0.16);
		backdrop-filter: blur(16px);
		box-shadow: 0 -0.5rem 2rem rgba(0, 0, 0, 0.5);
		user-select: none;
		-webkit-user-select: none;
		touch-action: manipulation;
		z-index: 40;
		transition: all 0.2s ease;
	}

	.virtual-gamepad.fixed-dock {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		padding: 0.4rem 1rem calc(0.4rem + env(safe-area-inset-bottom));
		border-radius: 1.25rem 1.25rem 0 0;
	}

	.virtual-gamepad.inline {
		position: relative;
		padding: 0.6rem 0.8rem;
		border-radius: 1rem;
	}

	/* Header Status / Tooltip */
	.controller-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0 0.25rem 0.35rem;
		margin-bottom: 0.1rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}
	.active-action-tooltip {
		font-size: 0.72rem;
		font-weight: 700;
	}
	.tooltip-hint {
		color: #64748b;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-size: 0.64rem;
	}
	.tooltip-badge {
		color: #38bdf8;
		background: rgba(56, 189, 248, 0.14);
		padding: 0.15rem 0.5rem;
		border-radius: 0.4rem;
		border: 1px solid rgba(56, 189, 248, 0.3);
	}
	.close-btn {
		background: none;
		border: none;
		color: #94a3b8;
		font-size: 0.85rem;
		cursor: pointer;
		padding: 0.1rem 0.4rem;
		border-radius: 0.25rem;
	}
	.close-btn:hover {
		color: #fff;
		background: rgba(255, 255, 255, 0.1);
	}

	/* Layout Split Zone */
	.pad-layout {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		padding-top: 0.2rem;
	}

	/* --- D-PAD 3D STYLES --- */
	.dpad-zone {
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.dpad-cross-3d {
		display: grid;
		grid-template-columns: repeat(3, 2.6rem);
		grid-template-rows: repeat(3, 2.6rem);
		gap: 2px;
		background: #080a14;
		padding: 4px;
		border-radius: 1.1rem;
		border: 1px solid rgba(255, 255, 255, 0.12);
		box-shadow:
			inset 0 2px 5px rgba(0, 0, 0, 0.8),
			0 4px 10px rgba(0, 0, 0, 0.4);
	}

	.dpad-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		background: linear-gradient(145deg, #23273c, #161828);
		color: #94a3b8;
		border: 1px solid rgba(255, 255, 255, 0.08);
		cursor: pointer;
		outline: none;
		transition: all 0.1s cubic-bezier(0.4, 0, 0.2, 1);
		padding: 0;
		position: relative;
	}
	.dpad-btn svg {
		width: 1.3rem;
		height: 1.3rem;
		transition: transform 0.1s ease;
	}

	.dpad-up {
		grid-column: 2;
		grid-row: 1;
		border-radius: 0.7rem 0.7rem 0 0;
	}
	.dpad-left {
		grid-column: 1;
		grid-row: 2;
		border-radius: 0.7rem 0 0 0.7rem;
	}
	.dpad-core {
		grid-column: 2;
		grid-row: 2;
		background: #111322;
		box-shadow: inset 0 0 4px rgba(0, 0, 0, 0.6);
	}
	.dpad-right {
		grid-column: 3;
		grid-row: 2;
		border-radius: 0 0.7rem 0.7rem 0;
	}
	.dpad-down {
		grid-column: 2;
		grid-row: 3;
		border-radius: 0 0 0.7rem 0.7rem;
	}

	.dpad-btn:hover {
		background: linear-gradient(145deg, #2d334e, #1c2035);
		color: #e2e8f0;
	}
	.dpad-btn.active,
	.dpad-btn:active {
		background: linear-gradient(145deg, #38bdf8, #0284c7);
		color: #fff;
		border-color: #38bdf8;
		box-shadow: 0 0 16px rgba(56, 189, 248, 0.75);
		transform: scale(0.93);
	}

	/* --- ABXY 3D STYLES --- */
	.abxy-zone {
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.abxy-diamond-3d {
		display: grid;
		grid-template-columns: repeat(3, 2.6rem);
		grid-template-rows: repeat(3, 2.6rem);
		gap: 5px;
		place-items: center;
	}

	.abxy-btn {
		width: 2.6rem;
		height: 2.6rem;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: linear-gradient(145deg, #202336, #141624);
		border: 2px solid rgba(255, 255, 255, 0.14);
		cursor: pointer;
		outline: none;
		position: relative;
		box-shadow:
			0 4px 8px rgba(0, 0, 0, 0.5),
			inset 0 1px 1px rgba(255, 255, 255, 0.2);
		transition: all 0.12s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.btn-badge {
		font-family: system-ui, sans-serif;
		font-weight: 900;
		font-size: 1.1rem;
		line-height: 1;
	}

	/* Y Button - Amber Gold */
	.btn-y {
		grid-column: 2;
		grid-row: 1;
		border-color: rgba(245, 158, 11, 0.5);
		color: #f59e0b;
	}
	.btn-y:hover,
	.btn-y.active {
		background: linear-gradient(145deg, #f59e0b, #b45309);
		color: #000;
		border-color: #f59e0b;
		box-shadow: 0 0 18px rgba(245, 158, 11, 0.85);
		transform: scale(0.92);
	}

	/* X Button - Sapphire Blue */
	.btn-x {
		grid-column: 1;
		grid-row: 2;
		border-color: rgba(59, 130, 246, 0.5);
		color: #60a5fa;
	}
	.btn-x:hover,
	.btn-x.active {
		background: linear-gradient(145deg, #3b82f6, #1d4ed8);
		color: #fff;
		border-color: #60a5fa;
		box-shadow: 0 0 18px rgba(59, 130, 246, 0.85);
		transform: scale(0.92);
	}

	/* B Button - Coral Red */
	.btn-b {
		grid-column: 3;
		grid-row: 2;
		border-color: rgba(244, 63, 94, 0.5);
		color: #fb7185;
	}
	.btn-b:hover,
	.btn-b.active {
		background: linear-gradient(145deg, #f43f5e, #be123c);
		color: #fff;
		border-color: #fb7185;
		box-shadow: 0 0 18px rgba(244, 63, 94, 0.85);
		transform: scale(0.92);
	}

	/* A Button - Emerald Green */
	.btn-a {
		grid-column: 2;
		grid-row: 3;
		border-color: rgba(16, 185, 129, 0.5);
		color: #34d399;
	}
	.btn-a:hover,
	.btn-a.active {
		background: linear-gradient(145deg, #10b981, #047857);
		color: #fff;
		border-color: #34d399;
		box-shadow: 0 0 18px rgba(16, 185, 129, 0.85);
		transform: scale(0.92);
	}

	@media (max-width: 480px) {
		.dpad-cross-3d {
			grid-template-columns: repeat(3, 2.3rem);
			grid-template-rows: repeat(3, 2.3rem);
		}
		.abxy-diamond-3d {
			grid-template-columns: repeat(3, 2.3rem);
			grid-template-rows: repeat(3, 2.3rem);
		}
		.abxy-btn {
			width: 2.3rem;
			height: 2.3rem;
		}
		.btn-badge {
			font-size: 0.95rem;
		}
	}
</style>
