<script lang="ts">
	import { onMount } from 'svelte';
	import type { InputAction, PlayerSnapshot } from '../../shared/types';
	import { KeyboardInput, SwipeInput } from '../client/input';
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
	let keyboardInput: KeyboardInput | undefined;
	let swipeInput: SwipeInput | undefined;

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
		const observer = new ResizeObserver(resize);
		observer.observe(canvas);
		resize();

		return () => {
			observer.disconnect();
		};
	});

	$effect(() => {
		if (canvas === undefined || !local || onInput === undefined) return;
		keyboardInput?.dispose();
		swipeInput?.dispose();
		keyboardInput = new KeyboardInput(canvas, onInput);
		swipeInput = new SwipeInput(canvas, onInput);
		canvas.focus();

		return () => {
			keyboardInput?.dispose();
			keyboardInput = undefined;
			swipeInput?.dispose();
			swipeInput = undefined;
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
	class:local
	tabindex={local ? 0 : -1}
	data-active-x={player.activePiece?.x ?? ''}
	aria-label={`${player.displayName}'s ${player.matchState} board`}
	aria-describedby={local ? 'local-touch-controls-description' : undefined}
></canvas>
{#if local}
	<p id="local-touch-controls-description" class="sr-only">
		Touch controls: swipe left or right to move, swipe up to rotate, swipe down
		to soft drop, and swipe down twice within 300 milliseconds to hard drop.
	</p>
{/if}

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
	canvas.local {
		touch-action: none;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	canvas:focus-visible {
		box-shadow: 0 0 0 3px #ffe66d;
	}
</style>
