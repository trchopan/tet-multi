<script lang="ts">
	import type { InputAction, PlayerSnapshot } from '../../shared/types';
	import PlayerCard from './PlayerCard.svelte';

	let {
		players,
		localPlayerId,
		onInput,
		renderPlayer,
	}: {
		players: PlayerSnapshot[];
		localPlayerId: string;
		onInput: ((action: InputAction) => void) | undefined;
		renderPlayer: (player: PlayerSnapshot) => PlayerSnapshot;
	} = $props();
	let showOpponents = $state(false);
	const localPlayer = $derived(
		players.find((player) => player.playerId === localPlayerId),
	);
	const opponents = $derived(
		players.filter((player) => player.playerId !== localPlayerId),
	);
</script>

<section class="game-view" aria-label="Multiplayer game boards">
	<div class="mobile-controls">
		<button
			type="button"
			aria-label={showOpponents ? 'Hide opponents' : 'Show opponents'}
			title={showOpponents ? 'Hide opponents' : 'Show opponents'}
			aria-expanded={showOpponents}
			aria-controls="opponent-boards"
			onclick={() => (showOpponents = !showOpponents)}
		>
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path
					d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm6-1a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 21a7 7 0 0 1 14 0H2Zm13.5-5.8A6.8 6.8 0 0 1 18 21h4a5 5 0 0 0-6.5-5.8Z"
				/>
			</svg>
		</button>
	</div>
	<div class="game-layout">
		<div class="local-column">
			{#if localPlayer !== undefined}
				<PlayerCard player={renderPlayer(localPlayer)} local {onInput} />
			{/if}
		</div>
		<aside
			id="opponent-boards"
			class="opponents"
			class:visible={showOpponents}
			aria-label="Opponent boards"
		>
			<div class="opponents-heading">
				<span>Opponents</span>
				<span>{opponents.length}</span>
			</div>
			<div class="opponent-list">
				{#each opponents as player (player.playerId)}
					<PlayerCard
						player={renderPlayer(player)}
						compact
						onInput={undefined}
					/>
				{/each}
			</div>
		</aside>
	</div>
</section>

<style>
	.game-view {
		height: 100%;
		min-height: 0;
		width: min(100%, 110rem);
		margin: auto;
	}
	.game-layout {
		height: 100%;
		min-height: 0;
		display: grid;
		grid-template-columns: minmax(0, 1.35fr) minmax(18rem, 0.65fr);
		gap: clamp(0.6rem, 1.5vw, 1rem);
	}
	.local-column {
		min-width: 0;
		min-height: 0;
		height: 100%;
		display: grid;
		grid-template-rows: minmax(0, 1fr);
		max-width: 58rem;
		width: 100%;
		margin: auto;
	}
	.opponents {
		min-width: 0;
		min-height: 0;
		overflow-x: hidden;
		overflow-y: auto;
		scrollbar-gutter: stable;
		padding: 0.85rem;
		border-radius: 0.8rem;
		background: rgba(20, 18, 38, 0.72);
	}
	.opponents-heading {
		display: flex;
		justify-content: space-between;
		margin-bottom: 0.6rem;
		color: #aaa5c0;
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.opponent-list {
		display: grid;
		gap: 0.6rem;
	}
	.mobile-controls {
		display: none;
	}
	@media (max-width: 760px) {
		.game-view {
			display: grid;
			grid-template-rows: auto minmax(0, 1fr);
			gap: 0.35rem;
		}
		.game-layout {
			height: auto;
			grid-template-columns: minmax(0, 1fr);
		}
		.local-column {
			max-width: 34rem;
		}
		.opponents {
			overflow: auto;
		}
		.mobile-controls {
			display: flex;
			justify-content: flex-end;
			margin-bottom: 0.35rem;
		}
		.mobile-controls button {
			display: grid;
			place-items: center;
			width: 2.5rem;
			height: 2.5rem;
			padding: 0;
			border: 1px solid #68627e;
			border-radius: 0.65rem;
			background: #18162a;
			color: #f4f1ff;
			font: inherit;
			font-weight: 800;
			cursor: pointer;
		}
		.mobile-controls svg {
			width: 1.25rem;
			height: 1.25rem;
			fill: currentColor;
		}
		.opponents:not(.visible) {
			display: none;
		}
	}
</style>
