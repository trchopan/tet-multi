<script lang="ts">
	import { onMount } from 'svelte';
	import type { RoomSnapshot } from '../../shared/types';
	import { gameRegistry } from '../../games';
	import { PluginInputDispatcher } from '../client/input';

	let {
		snapshot,
		local = true,
		onInput,
	}: {
		snapshot: RoomSnapshot;
		local?: boolean;
		onInput: ((action: any) => void) | undefined;
	} = $props();

	let canvas: HTMLCanvasElement;

	const gameType = $derived(snapshot.gameType ?? 'snake');
	const plugin = $derived(
		gameRegistry.has(gameType) ? gameRegistry.get(gameType) : undefined,
	);

	onMount(() => {
		const context = canvas.getContext('2d');
		if (context === null) return;

		const resize = (): void => {
			const rect = canvas.getBoundingClientRect();
			const dpr = window.devicePixelRatio || 1;
			canvas.width = rect.width * dpr;
			canvas.height = rect.height * dpr;
			context.setTransform(dpr, 0, 0, dpr, 0, 0);
		};

		const observer = new ResizeObserver(resize);
		observer.observe(canvas);
		resize();

		return () => {
			observer.disconnect();
		};
	});

	$effect(() => {
		if (!local || onInput === undefined || !plugin) return;
		const dispatcher = new PluginInputDispatcher(
			plugin.controls,
			window,
			onInput,
		);
		if (canvas) canvas.focus();

		return () => {
			dispatcher.dispose();
		};
	});

	$effect(() => {
		const context = canvas?.getContext('2d');
		if (context && canvas && plugin?.client.drawSharedView) {
			const rect = canvas.getBoundingClientRect();
			plugin.client.drawSharedView(context, snapshot, {
				x: 0,
				y: 0,
				width: rect.width,
				height: rect.height,
			});
		}
	});
</script>

<div class="shared-arena-container">
	<div class="arena-header">
		<h2>{plugin?.name ?? 'Shared Arena'}</h2>
		<span class="view-mode-badge">{plugin?.viewMode ?? 'shared-canvas'}</span>
	</div>
	<canvas
		bind:this={canvas}
		tabindex={local ? 0 : -1}
		aria-label={`${plugin?.name ?? 'Game'} Shared Arena`}
	></canvas>
	<div class="arena-footer">
		<span>Controls: Use Arrow Keys or W / A / S / D to move</span>
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
	}
	.arena-header {
		width: 100%;
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}
	.arena-header h2 {
		margin: 0;
		font-size: 1.25rem;
		color: #f8fafc;
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
		aspect-ratio: 4 / 3;
		background: #0f172a;
		border-radius: 0.5rem;
		border: 1px solid rgba(255, 255, 255, 0.1);
		outline: none;
	}
	canvas:focus {
		border-color: #3b82f6;
		box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5);
	}
	.arena-footer {
		margin-top: 0.5rem;
		font-size: 0.85rem;
		color: #94a3b8;
	}
</style>
