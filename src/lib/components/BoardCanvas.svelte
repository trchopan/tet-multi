<script lang="ts">
	import { onMount } from 'svelte';
	import type { InputAction, PlayerSnapshot } from '../../shared/types';
	import { KeyboardInput } from '../client/input';
	import {
		getCanvasMetrics,
		renderSnapshotBoard,
		type CanvasMetrics,
	} from '../client/renderer';

	let {
		player,
		local = false,
		onInput,
	}: {
		player: PlayerSnapshot;
		local?: boolean;
		onInput: ((action: InputAction) => void) | undefined;
	} = $props();
	let canvas: HTMLCanvasElement;
	let metrics = $state<CanvasMetrics>(getCanvasMetrics(0));

	onMount(() => {
		const context = canvas.getContext('2d');
		if (context === null) return;
		const resize = (): void => {
			const rect = canvas.getBoundingClientRect();
			metrics = getCanvasMetrics(
				rect.width,
				rect.height,
				window.devicePixelRatio,
			);
			canvas.width = metrics.pixelWidth;
			canvas.height = metrics.pixelHeight;
			context.setTransform(
				metrics.pixelWidth / Math.max(metrics.cssWidth, 1),
				0,
				0,
				metrics.pixelHeight / Math.max(metrics.cssHeight, 1),
				0,
				0,
			);
		};
		const input =
			local && onInput !== undefined
				? new KeyboardInput(canvas, onInput)
				: undefined;
		const observer = new ResizeObserver(resize);
		observer.observe(canvas);
		resize();
		if (local) canvas.focus();

		return () => {
			observer.disconnect();
			input?.dispose();
		};
	});

	$effect(() => {
		const context = canvas?.getContext('2d');
		if (context !== null && canvas !== undefined)
			renderSnapshotBoard(context, player, metrics);
	});
</script>

<canvas
	bind:this={canvas}
	tabindex={local ? 0 : -1}
	aria-label={`${player.displayName}'s ${player.matchState} board`}
></canvas>

<style>
	canvas {
		display: block;
		width: 100%;
		aspect-ratio: 1 / 2;
		background: #10121c;
		border: 1px solid rgba(255, 255, 255, 0.18);
		border-radius: 0.65rem;
		outline: none;
	}

	canvas:focus-visible {
		box-shadow: 0 0 0 3px #ffe66d;
	}
</style>
