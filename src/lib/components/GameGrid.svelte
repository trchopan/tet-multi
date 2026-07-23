<script lang="ts">
	import type { InputAction, PlayerSnapshot } from '../../shared/types';
	import PlayerCard from './PlayerCard.svelte';

	let {
		players,
		localPlayerId,
		onInput,
	}: {
		players: PlayerSnapshot[];
		localPlayerId: string;
		onInput: ((action: InputAction) => void) | undefined;
	} = $props();
</script>

<section class="game-view" aria-label="Multiplayer game boards">
	<div
		class="grid"
		class:two={players.length === 2}
		class:four={players.length === 4}
		class:five={players.length === 5}
	>
		{#each players as player (player.playerId)}
			<PlayerCard
				{player}
				local={player.playerId === localPlayerId}
				onInput={player.playerId === localPlayerId ? onInput : undefined}
			/>
		{/each}
	</div>
</section>

<style>
	.game-view {
		width: min(100%, 110rem);
		margin: auto;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: clamp(0.6rem, 1.5vw, 1rem);
	}
	.grid.two {
		grid-template-columns: repeat(2, minmax(0, 1fr));
		max-width: 70rem;
		margin: auto;
	}
	.grid.four {
		grid-template-columns: repeat(2, minmax(0, 1fr));
		max-width: 75rem;
		margin: auto;
	}
	.grid.five {
		grid-template-columns: repeat(6, minmax(0, 1fr));
	}
	:global(.grid.five > :nth-child(-n + 3)) {
		grid-column: span 2;
	}
	:global(.grid.five > :nth-child(4)) {
		grid-column: 2 / span 2;
	}
	:global(.grid.five > :nth-child(5)) {
		grid-column: 4 / span 2;
	}
	@media (max-width: 900px) {
		.grid,
		.grid.five {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		:global(.grid.five > :nth-child(-n + 5)) {
			grid-column: auto;
		}
	}
	@media (max-width: 560px) {
		.grid,
		.grid.two,
		.grid.four,
		.grid.five {
			grid-template-columns: 1fr;
		}
	}
</style>
