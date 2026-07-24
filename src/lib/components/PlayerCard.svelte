<script lang="ts">
	import type { InputAction, PlayerSnapshot } from '../../shared/types';
	import BoardCanvas from './BoardCanvas.svelte';
	import PiecePreview from './PiecePreview.svelte';

	let {
		player,
		local = false,
		compact = false,
		onInput,
	}: {
		player: PlayerSnapshot;
		local?: boolean;
		compact?: boolean;
		onInput: ((action: InputAction) => void) | undefined;
	} = $props();
</script>

<article
	class:local
	class:compact
	class:eliminated={player.matchState === 'eliminated'}
	class="card"
>
	<header class="identity">
		<div>
			<strong>{player.displayName}</strong>
			<span class="presence" class:offline={!player.connected}
				><i aria-hidden="true"></i>{local
					? 'You · '
					: player.playerType === 'computer'
						? 'Computer · '
						: ''}{player.connected ? 'Online' : 'Reconnecting'}</span
			>
		</div>
		<span
			class:danger={player.incomingGarbage !== undefined &&
				player.incomingGarbage > 0}
			class="state">{player.matchState}</span
		>
	</header>
	{#if local}
		<div class="local-gameplay">
			<aside class="hold-panel" aria-label="Held piece">
				<PiecePreview piece={player.hold} label="Hold" />
			</aside>
			<div class="board-wrap"><BoardCanvas {player} {local} {onInput} /></div>
			<aside class="side-panel">
				<div class="next-panel" aria-label="Next pieces">
					<span class="panel-label">Next</span>
					{#each (player.next ?? []).slice(0, 5) as piece, index (index)}
						<PiecePreview {piece} label={`${index + 1}`} small />
					{/each}
				</div>
				<div class="stats" aria-label={`${player.displayName} statistics`}>
					<div><span>Score</span><strong>{player.score ?? 0}</strong></div>
					<div><span>Lines</span><strong>{player.lines ?? 0}</strong></div>
					<div><span>Level</span><strong>{player.level ?? 1}</strong></div>
					<div><span>Combo</span><strong>{player.combo ?? 0}</strong></div>
					<div>
						<span>B2B</span><strong>{player.backToBack ? 'On' : '—'}</strong>
					</div>
					<div>
						<span>Attack</span><strong>{player.attackSent ?? 0}</strong>
					</div>
					<div>
						<span>Garbage</span><strong
							class:warning={(player.incomingGarbage ?? 0) > 0}
							>{player.incomingGarbage ?? 0}</strong
						>
					</div>
				</div>
			</aside>
		</div>
		<details class="controls">
			<summary>Controls <span>?</span></summary>
			<div aria-label="Keyboard controls">
				<span>Left / A, Right / D move</span><span>Down / S soft drop</span>
				<span>Space / W hard drop</span><span
					>Up / X rotate, Z / Q counter-rotate</span
				>
				<span>C / Shift hold</span>
			</div>
		</details>
	{:else}
		<div class="opponent-content">
			<div
				class="opponent-stats"
				aria-label={`${player.displayName} statistics`}
			>
				<span>Score <strong>{player.score ?? 0}</strong></span>
				<span>Lines <strong>{player.lines ?? 0}</strong></span>
				<span
					>Garbage <strong class:warning={(player.incomingGarbage ?? 0) > 0}
						>{player.incomingGarbage ?? 0}</strong
					></span
				>
				<span>Attack <strong>{player.attackSent ?? 0}</strong></span>
			</div>
			<BoardCanvas {player} {local} {onInput} />
		</div>
	{/if}
</article>

<style>
	.card {
		min-width: 0;
		padding: 0.8rem;
		border-radius: 0.8rem;
		background: #18162a;
	}
	.card.compact {
		padding: 0.65rem;
	}
	.card.local {
		min-height: 0;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
		border: 1px solid #ffe66d;
		box-shadow: 0 0 0 1px rgba(255, 230, 109, 0.25);
	}
	.card.eliminated {
		opacity: 0.68;
	}
	.identity {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		align-items: center;
		margin-bottom: 0.65rem;
	}
	.identity > div {
		min-width: 0;
	}
	.identity span,
	.opponent-stats {
		color: #aaa5c0;
		font-size: 0.72rem;
	}
	.identity strong {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.state {
		color: #aaa5c0;
		text-transform: capitalize;
	}
	.state.danger,
	.warning {
		color: #ff9f43 !important;
	}
	.presence {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}
	.presence i {
		width: 0.4rem;
		height: 0.4rem;
		border-radius: 50%;
		background: #58e38c;
	}
	.presence.offline i {
		background: #ff9f43;
	}
	.local-gameplay {
		min-height: 0;
		display: grid;
		grid-template-columns: minmax(5.25rem, 0.75fr) minmax(15rem, 2.4fr) minmax(
				7rem,
				0.95fr
			);
		gap: 0.7rem;
		align-items: stretch;
	}
	.board-wrap {
		min-width: 0;
		min-height: 0;
		display: flex;
		justify-content: center;
	}
	.card.local :global(canvas) {
		width: auto;
		height: 100%;
		max-width: 100%;
	}
	.hold-panel,
	.side-panel {
		min-width: 0;
	}
	.side-panel {
		display: grid;
		align-content: start;
		gap: 0.7rem;
	}
	.next-panel {
		display: grid;
		gap: 0.3rem;
	}
	.panel-label {
		color: #aaa5c0;
		font-size: 0.63rem;
		font-weight: 800;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.45rem;
		padding-top: 0.65rem;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}
	.stats div {
		display: grid;
		gap: 0.1rem;
	}
	.stats span,
	.opponent-stats span {
		color: #aaa5c0;
		font-size: 0.62rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.stats strong,
	.opponent-stats strong {
		color: #f4f1ff;
		font-size: 0.86rem;
	}
	.controls {
		margin-top: 0.65rem;
		color: #aaa5c0;
		font-size: 0.72rem;
	}
	.controls summary {
		width: fit-content;
		color: #c4c1d4;
		cursor: pointer;
		list-style: none;
	}
	.controls summary::-webkit-details-marker {
		display: none;
	}
	.controls summary span {
		display: inline-grid;
		place-items: center;
		width: 1rem;
		height: 1rem;
		margin-left: 0.2rem;
		border: 1px solid #68627e;
		border-radius: 50%;
	}
	.controls div {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.25rem 0.5rem;
		margin-top: 0.45rem;
	}
	.opponent-content {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 4.5rem;
		gap: 0.7rem;
		align-items: center;
	}
	.opponent-content :global(canvas) {
		width: 5.25rem;
	}
	.opponent-stats {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.4rem;
	}
	@media (max-width: 760px) {
		.card {
			padding: 0.5rem;
		}
		.local-gameplay {
			grid-template-columns: 4.5rem minmax(0, 1fr) 5.5rem;
			gap: 0.4rem;
		}
		.controls div {
			grid-template-columns: 1fr;
		}
	}
	@media (max-width: 520px) {
		.local-gameplay {
			grid-template-columns: 4.25rem minmax(0, 1fr);
			grid-template-rows: clamp(15rem, 48dvh, 18rem) auto;
			row-gap: 0.6rem;
		}
		.board-wrap {
			height: clamp(15rem, 48dvh, 18rem);
			min-height: 0;
		}
		.side-panel {
			grid-column: 1 / -1;
			grid-row: 2;
			grid-template-columns: 1fr 1.25fr;
			align-items: start;
		}
		.next-panel {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 0.2rem;
		}
		.next-panel :global(.preview) {
			gap: 0;
			padding: 0.2rem;
		}
		.next-panel :global(.preview.small .preview-label) {
			font-size: 0.5rem;
		}
		.next-panel :global(.preview.small .piece) {
			width: min(2.5rem, 100%);
		}
		.next-panel .panel-label {
			grid-column: 1 / -1;
		}
		.next-panel > :global(.preview:last-child) {
			grid-column: 1 / -1;
			width: 4.5rem;
			justify-self: center;
		}
		.opponent-content {
			grid-template-columns: minmax(0, 1fr) 4rem;
		}
		.opponent-content :global(canvas) {
			width: 4.5rem;
		}
	}
</style>
