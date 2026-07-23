<script lang="ts">
	import type { RoomSnapshot } from '../../shared/types';
	import type { ConnectionState } from '../client/websocket';

	let {
		snapshot,
		localPlayerId,
		onReturn,
		connectionState = 'connected',
	}: {
		snapshot: RoomSnapshot;
		localPlayerId: string;
		onReturn: () => void;
		connectionState?: ConnectionState;
	} = $props();

	const winners = $derived(
		snapshot.players.filter((player) =>
			snapshot.winnerPlayerIds?.includes(player.playerId),
		),
	);
	const isHost = $derived(snapshot.hostPlayerId === localPlayerId);
</script>

<section
	class="results"
	aria-labelledby="results-title"
	data-results-match-id={snapshot.matchId}
	data-winner-player-ids={snapshot.winnerPlayerIds?.join(',') ?? ''}
>
	<p class="eyebrow">Match finished</p>
	<p class="connection" role="status" aria-live="polite">
		{connectionState === 'connected'
			? 'Connected'
			: connectionState === 'reconnecting'
				? 'Connection lost, retrying…'
				: connectionState === 'stale'
					? 'Connection stale, reconnecting…'
					: 'Disconnected'}
	</p>
	<h1 id="results-title">
		{winners.length === 0
			? 'Draw'
			: winners.length === 1
				? `${winners[0]?.displayName} wins`
				: 'Shared win'}
	</h1>
	<p class="summary" aria-live="polite">
		{winners.length === 0
			? 'The final players topped out together.'
			: 'Final standings are confirmed by the server.'}
	</p>
	<div class="table-wrap">
		<table>
			<caption>Final standings</caption>
			<thead
				><tr
					><th scope="col">Place</th><th scope="col">Player</th><th scope="col"
						>Score</th
					><th scope="col">Lines</th><th scope="col">Attack</th><th scope="col"
						>Max combo</th
					></tr
				></thead
			>
			<tbody>
				{#each snapshot.players.toSorted((a, b) => (a.placement ?? 99) - (b.placement ?? 99)) as player}
					<tr class:local={player.playerId === localPlayerId}>
						<td>{player.placement ?? '—'}</td><td
							>{player.displayName}{player.connected
								? ''
								: ' (disconnected)'}</td
						><td>{player.score ?? 0}</td><td>{player.lines ?? 0}</td><td
							>{player.attackSent ?? 0}</td
						><td>{player.maxCombo ?? 0}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	{#if isHost}
		<button type="button" onclick={onReturn}>Return to lobby</button>
	{:else}
		<p class="waiting">Waiting for the host to return everyone to the lobby.</p>
	{/if}
</section>

<style>
	.results {
		width: min(100%, 72rem);
		margin: auto;
		padding: clamp(1.2rem, 4vw, 2.5rem);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 1rem;
		background: rgba(20, 18, 38, 0.92);
	}
	.eyebrow {
		color: #ffe66d;
		font-size: 0.78rem;
		font-weight: 800;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.connection {
		color: #58e38c;
		font-size: 0.85rem;
	}
	h1 {
		margin: 0.3rem 0;
		font-size: clamp(2.3rem, 8vw, 5rem);
		letter-spacing: -0.07em;
	}
	.summary,
	.waiting {
		color: #aaa5c0;
	}
	.table-wrap {
		overflow-x: auto;
		margin: 1.5rem 0;
	}
	table {
		width: 100%;
		min-width: 38rem;
		border-collapse: collapse;
		text-align: left;
	}
	caption {
		margin-bottom: 0.6rem;
		text-align: left;
		font-weight: 800;
	}
	th,
	td {
		padding: 0.7rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}
	th {
		color: #aaa5c0;
		font-size: 0.75rem;
		text-transform: uppercase;
	}
	tr.local {
		background: rgba(255, 230, 109, 0.1);
	}
	button {
		padding: 0.8rem 1rem;
		border: 0;
		border-radius: 0.5rem;
		background: #ffe66d;
		color: #10121c;
		font: inherit;
		font-weight: 800;
		cursor: pointer;
	}
	button:focus-visible {
		outline: 3px solid #f4f1ff;
		outline-offset: 2px;
	}
</style>
