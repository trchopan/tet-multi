<script lang="ts">
	import type { RoomSnapshot } from '../../shared/types';
	import { MAX_PLAYERS_PER_ROOM } from '../../shared/constants';
	import { getLobbyStartState } from '../client/lobby';

	let {
		snapshot,
		localPlayerId,
		onReady,
		onStart,
		onLeave,
		error = '',
		connectionState = 'connected',
	}: {
		snapshot: RoomSnapshot;
		localPlayerId: string;
		onReady: (ready: boolean) => void;
		onStart: () => void;
		onLeave: () => void;
		error?: string;
		connectionState?:
			'connecting' | 'connected' | 'reconnecting' | 'stale' | 'closed';
	} = $props();
	let copied = $state(false);
	let copyError = $state('');

	const local = $derived(
		snapshot.players.find((player) => player.playerId === localPlayerId),
	);
	const startState = $derived(getLobbyStartState(snapshot.players));
	const canStart = $derived(startState.canStart && snapshot.phase === 'lobby');
	const startReason = $derived(startState.reason);

	const copyInvite = async (): Promise<void> => {
		const url = `${globalThis.location.origin}/room/${snapshot.roomCode}`;
		try {
			if (navigator.clipboard?.writeText !== undefined) {
				await navigator.clipboard.writeText(url);
			} else {
				const input = document.createElement('textarea');
				try {
					input.value = url;
					input.setAttribute('readonly', '');
					input.style.position = 'fixed';
					input.style.opacity = '0';
					document.body.append(input);
					input.select();
					if (!document.execCommand('copy')) throw new Error('Copy failed');
				} finally {
					input.remove();
				}
			}
			copyError = '';
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			copied = false;
			copyError = 'Copy failed. Select and copy the invite URL manually.';
		}
	};
</script>

<section class="lobby" aria-labelledby="lobby-title">
	<div class="header">
		<div>
			<p class="eyebrow">Waiting room</p>
			<h1 id="lobby-title">Room {snapshot.roomCode}</h1>
		</div>
		<button class="secondary" type="button" onclick={copyInvite}>
			{copied ? 'Invite copied' : 'Copy invite URL'}
		</button>
	</div>
	<p class="capacity">
		{snapshot.players.length} / {MAX_PLAYERS_PER_ROOM} players
	</p>
	<p class="connection" role="status" aria-live="polite">
		{connectionState === 'connected'
			? 'Connected'
			: connectionState === 'reconnecting'
				? 'Connection lost, retrying…'
				: connectionState === 'stale'
					? 'Connection stale, reconnecting…'
					: 'Disconnected'}
	</p>
	<ul class="players" aria-label="Players in room">
		{#each snapshot.players as player}
			<li class:local={player.playerId === localPlayerId}>
				<div>
					<strong>{player.displayName}</strong>
					<span
						>{player.isHost ? 'Host' : 'Player'} · {player.connected
							? 'Connected'
							: 'Reconnecting'}</span
					>
				</div>
				<span class:ready={player.ready} class="ready-label"
					>{player.ready ? 'Ready' : 'Not ready'}</span
				>
			</li>
		{/each}
	</ul>
	<div class="actions">
		{#if local !== undefined}
			<button type="button" onclick={() => onReady(!local.ready)}>
				{local.ready ? 'Set not ready' : 'Ready up'}
			</button>
		{/if}
		{#if local?.isHost}
			<button type="button" disabled={!canStart} onclick={onStart}
				>Start match</button
			>
			<span class="reason">{startReason}</span>
		{/if}
		<button class="quiet" type="button" onclick={onLeave}>Leave room</button>
	</div>
	<p class="error" aria-live="polite">{error || copyError}</p>
</section>

<style>
	.lobby {
		width: min(100%, 48rem);
		margin: auto;
		padding: clamp(1.25rem, 4vw, 2.5rem);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 1rem;
		background: rgba(20, 18, 38, 0.9);
	}
	.header {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		align-items: start;
	}
	.eyebrow,
	.capacity {
		color: #ffe66d;
		font-size: 0.78rem;
		font-weight: 800;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.connection {
		margin: -0.7rem 0 1rem;
		color: #58e38c;
		font-size: 0.85rem;
	}
	h1 {
		margin: 0.3rem 0 1rem;
		font-size: clamp(2rem, 7vw, 4rem);
		letter-spacing: -0.06em;
	}
	.players {
		display: grid;
		gap: 0.6rem;
		margin: 1.5rem 0;
		padding: 0;
		list-style: none;
	}
	.players li {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		align-items: center;
		padding: 0.9rem 1rem;
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 0.65rem;
		background: rgba(255, 255, 255, 0.04);
	}
	.players li.local {
		border-color: #ffe66d;
		box-shadow: inset 3px 0 #ffe66d;
	}
	.players span {
		display: block;
		color: #aaa5c0;
		font-size: 0.8rem;
	}
	.ready-label.ready {
		color: #58e38c;
		font-weight: 800;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.7rem;
		align-items: center;
	}
	button {
		padding: 0.75rem 1rem;
		border: 0;
		border-radius: 0.5rem;
		background: #ffe66d;
		color: #10121c;
		font: inherit;
		font-weight: 800;
		cursor: pointer;
	}
	button.secondary {
		background: #9b8cff;
	}
	button.quiet {
		background: transparent;
		color: #c4c1d4;
		border: 1px solid #68627e;
	}
	button:disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}
	.reason,
	.error {
		flex-basis: 100%;
		color: #aaa5c0;
		font-size: 0.85rem;
	}
	.error {
		color: #ff9f9f;
	}
	button:focus-visible {
		outline: 3px solid #f4f1ff;
		outline-offset: 2px;
	}
	@media (max-width: 520px) {
		.header {
			display: grid;
		}
	}
</style>
