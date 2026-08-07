<script lang="ts">
	import type { PieceKind } from '../../games/falling-blocks/types';
	import { getPreviewCellIndexes } from '../client/piece-preview';
	import { getPieceColor } from '../client/theme';

	let {
		piece,
		label,
		small = false,
	}: {
		piece: PieceKind | undefined;
		label: string;
		small?: boolean;
	} = $props();

	const cells = $derived(
		new Set(piece === undefined ? [] : getPreviewCellIndexes(piece)),
	);
	const color = $derived(
		piece === undefined ? '#68627e' : getPieceColor(piece),
	);
</script>

<div
	class:small
	class="preview"
	aria-label={piece === undefined
		? `${label}, empty`
		: `${label}, ${piece} piece`}
>
	<span class="preview-label">{label}</span>
	<div
		class="piece"
		data-piece={piece ?? 'empty'}
		style={`--piece-color: ${color}`}
	>
		{#each Array(8) as _, index}
			<span class:filled={cells.has(index)}></span>
		{/each}
	</div>
</div>

<style>
	.preview {
		display: grid;
		gap: 0.35rem;
		min-width: 5.25rem;
		padding: 0.55rem;
		border-radius: 0.6rem;
		background: rgba(16, 18, 28, 0.7);
	}
	.preview-label {
		color: #aaa5c0;
		font-size: 0.63rem;
		font-weight: 800;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.piece {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		grid-template-rows: repeat(2, 1fr);
		width: 4rem;
		aspect-ratio: 2 / 1;
		margin: auto;
	}
	.piece span {
		margin: 1px;
	}
	.piece span.filled {
		background: var(--piece-color);
	}
	.piece[data-piece='empty']::after {
		content: '—';
		grid-column: 1 / -1;
		grid-row: 1 / -1;
		align-self: center;
		justify-self: center;
		color: #68627e;
	}
	.preview.small {
		min-width: 0;
		padding: 0.35rem;
		gap: 0.15rem;
	}
	.preview.small .preview-label {
		font-size: 0.55rem;
	}
	.preview.small .piece {
		width: min(3rem, 100%);
	}
</style>
