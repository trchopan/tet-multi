<script lang="ts">
	import type { InputAction, PlayerSnapshot } from '../../shared/types';
	import BoardCanvas from './BoardCanvas.svelte';

	let {
		player,
		local = false,
		onInput,
	}: {
		player: PlayerSnapshot;
		local?: boolean;
		onInput: ((action: InputAction) => void) | undefined;
	} = $props();
</script>

<article
	class:local
	class:eliminated={player.matchState === 'eliminated'}
	class="card"
>
	<header>
		<div>
			<strong>{player.displayName}</strong>
			<span
				>{local ? 'You · ' : ''}{player.connected
					? 'Connected'
					: 'Disconnected'}</span
			>
		</div>
		<span class="state">{player.matchState}</span>
	</header>
	<BoardCanvas {player} {local} {onInput} />
	<div class="stats" aria-label={`${player.displayName} statistics`}>
		<span>Score <strong>{player.score ?? 0}</strong></span>
		<span>Lines <strong>{player.lines ?? 0}</strong></span>
		<span>Garbage <strong>{player.incomingGarbage ?? 0}</strong></span>
	</div>
	{#if local}
		<div class="extras">
			<span>Hold: <strong>{player.hold ?? '—'}</strong></span>
			<span>Next: {player.next?.join(' · ') ?? '—'}</span>
		</div>
		<div class="controls" aria-label="Keyboard controls">
			<strong>Controls</strong>
			<span>Left / A, Right / D move</span>
			<span>Down / S soft drop</span>
			<span>Space / W hard drop</span>
			<span>Up / X rotate, Z / Q counter-rotate</span>
			<span>C / Shift hold</span>
		</div>
	{/if}
</article>

<style>
	.card {
		min-width: 0;
		padding: 0.7rem;
		border: 1px solid rgba(255, 255, 255, 0.13);
		border-radius: 0.8rem;
		background: #18162a;
	}
	.card.local {
		border-color: #ffe66d;
		box-shadow: 0 0 0 1px rgba(255, 230, 109, 0.25);
	}
	.card.eliminated {
		opacity: 0.68;
	}
	header,
	.stats,
	.extras {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		align-items: center;
	}
	header {
		margin-bottom: 0.55rem;
	}
	header span,
	.extras,
	.stats {
		color: #aaa5c0;
		font-size: 0.72rem;
	}
	header strong {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.state {
		color: #ffe66d;
		text-transform: capitalize;
	}
	.stats {
		padding: 0.55rem 0 0.15rem;
	}
	.stats strong {
		color: #f4f1ff;
	}
	.extras,
	.controls {
		display: grid;
		gap: 0.2rem;
		margin-top: 0.5rem;
	}
	.controls {
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.25rem 0.5rem;
	}
	.controls strong {
		grid-column: 1 / -1;
		color: #f4f1ff;
	}
</style>
