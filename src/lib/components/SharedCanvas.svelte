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

	const handleClick = (e: MouseEvent): void => {
		if (!onInput || !canvas || currentSnapshot.phase !== 'playing') return;
		const rect = canvas.getBoundingClientRect();
		const clickY = e.clientY - rect.top;
		const hudY = rect.height - 65;

		if (clickY >= hudY) {
			const itemW = rect.width / 5;
			const clickX = e.clientX - rect.left;
			const idx = Math.floor(clickX / itemW);

			if (idx === 0) onInput('button_a');
			else if (idx === 1) onInput('button_b');
			else if (idx === 2) onInput('button_x');
			else if (idx === 3) onInput('button_y');
			else if (idx === 4) onInput('up');
		}
	};
</script>

<div class="shared-arena-container">
	<div class="arena-header">
		<h2>{plugin?.name ?? 'Shared Arena'}</h2>
		<span class="view-mode-badge">{plugin?.viewMode ?? 'shared-canvas'}</span>
	</div>
	<canvas
		bind:this={canvas}
		tabindex={local ? 0 : -1}
		onclick={handleClick}
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
