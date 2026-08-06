<script lang="ts">
	import { onMount } from 'svelte';
	import type { InputAction, RoomSnapshot } from '../../shared/types';
	import { gameRegistry } from '../../games';
	import { UnifiedInputController } from '../client/input';
	import VirtualGamepad from './VirtualGamepad.svelte';
	import ControlLegend from './ControlLegend.svelte';

	let {
		snapshot,
		local = true,
		onInput,
	}: {
		snapshot: RoomSnapshot;
		local?: boolean | undefined;
		onInput?: ((action: any) => void) | undefined;
	} = $props();

	let canvas: HTMLCanvasElement;
	let showGamepad = $state(false);
	let activeActions = $state(new Set<InputAction>());
	let controller: UnifiedInputController | undefined;

	const gameType = $derived(snapshot.gameType ?? 'snake');
	const plugin = $derived(
		gameRegistry.has(gameType) ? gameRegistry.get(gameType) : undefined,
	);

	const currentSnapshot = $derived(snapshot);

	let width = 0;
	let height = 0;

	onMount(() => {
		const context = canvas.getContext('2d');
		if (context === null) return;

		const resize = (): void => {
			const rect = canvas.getBoundingClientRect();
			const dpr = window.devicePixelRatio || 1;
			const newW = Math.floor(rect.width * dpr);
			const newH = Math.floor(rect.height * dpr);

			if (newW > 0 && newH > 0) {
				if (canvas.width !== newW || canvas.height !== newH) {
					canvas.width = newW;
					canvas.height = newH;
				}
				context.setTransform(dpr, 0, 0, dpr, 0, 0);
				width = rect.width;
				height = rect.height;
			}
		};

		const observer = new ResizeObserver(resize);
		observer.observe(canvas);
		resize();

		let animId: number;
		const render = (): void => {
			if (
				context &&
				canvas &&
				plugin?.client.drawSharedView &&
				width > 0 &&
				height > 0
			) {
				plugin.client.drawSharedView(context, currentSnapshot, {
					x: 0,
					y: 0,
					width,
					height,
				});
			}
			animId = requestAnimationFrame(render);
		};
		animId = requestAnimationFrame(render);

		return () => {
			cancelAnimationFrame(animId);
			observer.disconnect();
		};
	});

	$effect(() => {
		if (!local || onInput === undefined || !plugin) return;
		controller?.dispose();
		controller = new UnifiedInputController(
			plugin.controls,
			window,
			onInput,
			(newSet) => {
				activeActions = newSet;
			},
		);
		if (canvas) canvas.focus();

		return () => {
			controller?.dispose();
			controller = undefined;
		};
	});
</script>

<div class="shared-arena-container">
	<div class="arena-header">
		<h2>{plugin?.name ?? 'Shared Arena'}</h2>
		<div class="header-actions">
			{#if local && onInput}
				<button
					type="button"
					class="controller-toggle-btn"
					onclick={() => (showGamepad = !showGamepad)}
					aria-label={showGamepad ? 'Hide Controller' : 'Show Controller'}
				>
					🎮 Controls
				</button>
			{/if}
			<span class="view-mode-badge">{plugin?.viewMode ?? 'shared-canvas'}</span>
		</div>
	</div>
	<canvas
		bind:this={canvas}
		class:mobile-poker={gameType === 'poker'}
		style={`aspect-ratio: ${plugin?.aspectRatio ?? 4 / 3};`}
		tabindex={local ? 0 : -1}
		aria-label={`${plugin?.name ?? 'Game'} Shared Arena`}
	></canvas>

	{#if local && onInput && plugin}
		<div class="dock-wrapper" class:mobile-only={!showGamepad}>
			<VirtualGamepad
				controls={plugin.controls}
				onAction={(action: InputAction) =>
					controller
						? controller.pressVirtualAction(action)
						: onInput?.(action)}
				onReleaseAction={(action: InputAction) =>
					controller?.releaseVirtualAction(action)}
				{activeActions}
				mode="fixed-dock"
				onClose={() => (showGamepad = false)}
			/>
		</div>
	{/if}

	<div class="arena-footer">
		{#if plugin?.controls}
			<ControlLegend controls={plugin.controls} compact={true} />
		{/if}
	</div>
</div>

<style>
	.shared-arena-container {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		background: #090d16;
		border: 1px solid rgba(255, 255, 255, 0.16);
		border-radius: 1rem;
		padding: 1rem;
		box-shadow: 0 1rem 3rem rgba(0, 0, 0, 0.4);
		gap: 0.75rem;
		position: relative;
	}
	.arena-header {
		width: 100%;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.arena-header h2 {
		margin: 0;
		font-size: 1.25rem;
		color: #f8fafc;
	}
	.header-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.controller-toggle-btn {
		background: rgba(108, 92, 231, 0.25);
		border: 1px solid rgba(108, 92, 231, 0.5);
		color: #ffe66d;
		font-size: 0.75rem;
		font-weight: 700;
		padding: 0.25rem 0.6rem;
		border-radius: 0.5rem;
		cursor: pointer;
	}
	.controller-toggle-btn:hover {
		background: rgba(108, 92, 231, 0.4);
	}
	.view-mode-badge {
		background: #3b82f6;
		color: #fff;
		font-size: 0.75rem;
		padding: 0.2rem 0.6rem;
		border-radius: 999px;
		font-weight: 600;
		text-transform: uppercase;
	}
	canvas {
		width: 100%;
		max-width: 900px;
		background: #0f172a;
		border-radius: 0.5rem;
		border: 1px solid rgba(255, 255, 255, 0.1);
		outline: none;
	}
	canvas:focus {
		border-color: #3b82f6;
		box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5);
	}
	.dock-wrapper.mobile-only {
		display: none;
	}
	.arena-footer {
		width: 100%;
		font-size: 0.85rem;
		color: #94a3b8;
	}
	@media (max-width: 768px) {
		.dock-wrapper.mobile-only {
			display: block;
		}
		.shared-arena-container {
			padding-bottom: 7.5rem;
		}
		.arena-footer {
			display: none;
		}
		canvas.mobile-poker {
			aspect-ratio: 3 / 4 !important;
			max-height: 55dvh;
		}
	}
</style>
