<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { RoomSnapshot } from '$/shared/types';
	import {
		COMPUTER_DIFFICULTIES,
		MAX_COMPUTER_PLAYERS_PER_ROOM,
		MAX_PLAYERS_PER_ROOM,
	} from '$/shared/constants';
	import type { ComputerDifficulty } from '$/shared/types';
	import { getLobbyStartState } from '$/lib/client/lobby';

	let {
		snapshot,
		localPlayerId,
		onReady,
		onStart,
		onAddComputer,
		onRemoveComputer,
		onLeave,
		error = '',
		connectionState = 'connected',
	}: {
		snapshot: RoomSnapshot;
		localPlayerId: string;
		onReady: (ready: boolean) => void;
		onStart: () => void;
		onAddComputer: (difficulty: ComputerDifficulty) => void;
		onRemoveComputer: (playerId: string) => void;
		onLeave: () => void;
		error?: string;
		connectionState?:
			'connecting' | 'connected' | 'reconnecting' | 'stale' | 'closed';
	} = $props();
	let copied = $state(false);
	let copyError = $state('');
	let selectedComputerDifficulty = $state<ComputerDifficulty>('legendary');
	let copyResetTimer: ReturnType<typeof setTimeout> | undefined;

	onDestroy(() => {
		if (copyResetTimer !== undefined) clearTimeout(copyResetTimer);
	});

	const difficultyLabel = (difficulty: ComputerDifficulty): string =>
		difficulty[0]!.toUpperCase() + difficulty.slice(1);

	const local = $derived(
		snapshot.players.find((player) => player.playerId === localPlayerId),
	);
	const startState = $derived(getLobbyStartState(snapshot.players));
	const canStart = $derived(startState.canStart && snapshot.phase === 'lobby');
	const startReason = $derived(startState.reason);
	const canAddComputer = $derived(
		snapshot.players.length < MAX_PLAYERS_PER_ROOM &&
			snapshot.players.filter((player) => player.playerType === 'computer')
				.length < MAX_COMPUTER_PLAYERS_PER_ROOM,
	);
	const emptySlotCount = $derived(
		Math.max(0, MAX_PLAYERS_PER_ROOM - snapshot.players.length),
	);

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
			if (copyResetTimer !== undefined) clearTimeout(copyResetTimer);
			copyResetTimer = setTimeout(() => {
				copied = false;
				copyResetTimer = undefined;
			}, 1500);
		} catch {
			copied = false;
			copyError = 'Copy failed. Select and copy the invite URL manually.';
		}
	};
</script>

<section class="lobby" aria-labelledby="lobby-title">
	<header class="room-header">
		<div class="room-heading">
			<p class="eyebrow">
				Waiting room · {snapshot.gameType
					? snapshot.gameType.toUpperCase()
					: 'FALLING BLOCKS'}
			</p>
			<div class="title-row">
				<h1 id="lobby-title">Room {snapshot.roomCode}</h1>
				<p class="connection" role="status" aria-live="polite">
					<i class:offline={connectionState !== 'connected'} aria-hidden="true"
					></i>
					{connectionState === 'connected'
						? 'Connected'
						: connectionState === 'reconnecting'
							? 'Retrying connection'
							: connectionState === 'stale'
								? 'Connection stale'
								: 'Disconnected'}
				</p>
			</div>
			<p class="room-intro">Invite friends, get ready, and start the match.</p>
		</div>
		<div class="header-actions">
			<div class="invite-card">
				<div>
					<span class="card-label">Invite friends</span>
					<span class="invite-hint">Share this room with your squad</span>
				</div>
				<button class="secondary" type="button" onclick={copyInvite}>
					{copied ? 'Invite copied' : 'Copy invite URL'}
				</button>
			</div>
			<button class="quiet leave-button" type="button" onclick={onLeave}
				>Leave room</button
			>
		</div>
	</header>

	<div class="lobby-grid">
		<section class="panel roster-panel" aria-labelledby="players-title">
			<header class="panel-heading">
				<div>
					<p class="card-label">Room roster</p>
					<h2 id="players-title">Players</h2>
				</div>
				<span class="capacity"
					>{snapshot.players.length} / {MAX_PLAYERS_PER_ROOM} players</span
				>
			</header>
			<ul class="players" aria-label="Players in room">
				{#each snapshot.players as player}
					<li class:local={player.playerId === localPlayerId}>
						<div class="player-identity">
							<i
								class:offline={!player.connected}
								class="player-dot"
								aria-hidden="true"
							></i>
							<div>
								<strong>{player.displayName}</strong>
								{#if player.playerId === localPlayerId}<span class="you-badge"
										>You</span
									>{/if}
								<span class="player-meta">
									{player.playerType === 'computer'
										? `Computer · ${difficultyLabel(player.computerDifficulty ?? 'legendary')}`
										: player.isHost
											? 'Host'
											: 'Player'}
									· {player.connected ? 'Connected' : 'Reconnecting'}
								</span>
							</div>
						</div>
						{#if player.playerType === 'computer' && local?.isHost}
							<button
								class="remove-computer"
								type="button"
								onclick={() => onRemoveComputer(player.playerId)}
							>
								Remove
							</button>
						{:else}
							<span class:ready={player.ready} class="ready-label"
								>{player.ready ? 'Ready' : 'Not ready'}</span
							>
						{/if}
					</li>
				{/each}
				{#each Array.from({ length: emptySlotCount }) as _}
					<li class="empty-slot">
						<i aria-hidden="true"></i><span>Open slot</span>
					</li>
				{/each}
			</ul>
		</section>

		<aside class="controls-column">
			<section
				class:ready={local?.ready}
				class="panel readiness-panel"
				aria-labelledby="readiness-title"
			>
				<p class="card-label">Your status</p>
				<h2 id="readiness-title">
					{local?.ready ? 'You are ready' : 'Ready when you are'}
				</h2>
				<p>
					{local?.ready
						? 'Waiting for the rest of the room.'
						: 'Mark yourself ready when you are set to play.'}
				</p>
				{#if local !== undefined}
					<button
						class="ready-button"
						type="button"
						onclick={() => onReady(!local.ready)}
					>
						{local.ready ? 'Set not ready' : 'Ready up'}
					</button>
				{/if}
			</section>

			{#if local?.isHost}
				<section class="panel host-panel" aria-labelledby="host-controls-title">
					<div class="panel-heading compact">
						<div>
							<p class="card-label">Host controls</p>
							<h2 id="host-controls-title">Match setup</h2>
						</div>
					</div>
					<div class="computer-controls">
						<label class="difficulty-picker">
							<span>Computer level</span>
							<select bind:value={selectedComputerDifficulty}>
								{#each COMPUTER_DIFFICULTIES as difficulty}
									<option value={difficulty}
										>{difficultyLabel(difficulty)}</option
									>
								{/each}
							</select>
						</label>
						<button
							class="add-computer"
							type="button"
							disabled={!canAddComputer}
							onclick={() => onAddComputer(selectedComputerDifficulty)}
						>
							Add computer
						</button>
					</div>
					<div class="start-block">
						<button
							class="start-button"
							type="button"
							disabled={!canStart}
							aria-describedby="start-match-reason"
							onclick={onStart}>Start match</button
						>
						<p id="start-match-reason" class="reason">{startReason}</p>
					</div>
				</section>
			{:else}
				<section class="panel waiting-panel">
					<p class="card-label">Host controls</p>
					<h2>Waiting for the host</h2>
					<p>The host will start the match once everyone is ready.</p>
				</section>
			{/if}
		</aside>
	</div>

	<p class="error" aria-live="polite">{error || copyError}</p>
</section>

<style>
	.lobby {
		width: min(100%, 68rem);
		margin: auto;
		padding: clamp(1.25rem, 4vw, 3rem);
		border: 1px solid rgba(196, 191, 235, 0.2);
		border-radius: 1.25rem;
		background: rgba(20, 18, 38, 0.92);
		box-shadow: 0 1.5rem 4rem rgba(5, 4, 15, 0.22);
	}
	.room-header,
	.header-actions,
	.title-row,
	.panel-heading,
	.player-identity,
	.computer-controls {
		display: flex;
		align-items: start;
	}
	.room-header,
	.panel-heading {
		justify-content: space-between;
		gap: 1.5rem;
	}
	.room-heading {
		min-width: 0;
	}
	.title-row {
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.header-actions {
		align-items: stretch;
		flex-direction: column;
		min-width: min(100%, 21rem);
	}
	.eyebrow,
	.card-label {
		color: #ffe66d;
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.eyebrow {
		margin: 0 0 0.65rem;
	}
	.card-label {
		display: block;
		margin: 0 0 0.35rem;
	}
	.room-intro,
	.invite-hint,
	.readiness-panel p,
	.waiting-panel p {
		color: #aaa5c0;
	}
	.room-intro {
		margin: 0.75rem 0 0;
		font-size: 0.95rem;
	}
	.connection {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		margin: 0;
		color: #58e38c;
		font-size: 0.76rem;
		font-weight: 800;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}
	.connection i,
	.player-dot {
		display: inline-block;
		flex: 0 0 auto;
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: #58e38c;
	}
	.connection i.offline,
	.player-dot.offline {
		background: #ff9f43;
	}
	h1 {
		margin: 0;
		font-size: clamp(2rem, 5vw, 3.75rem);
		letter-spacing: -0.07em;
		line-height: 0.95;
	}
	.invite-card {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		border: 1px solid rgba(155, 140, 255, 0.35);
		border-radius: 0.85rem;
		background: rgba(155, 140, 255, 0.1);
	}
	.invite-hint {
		display: block;
		font-size: 0.75rem;
	}
	.invite-card button {
		white-space: nowrap;
	}
	.lobby-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.35fr) minmax(18rem, 0.9fr);
		gap: 1rem;
		margin-top: 2.25rem;
	}
	.panel {
		padding: 1.25rem;
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 0.9rem;
		background: rgba(255, 255, 255, 0.035);
	}
	.panel-heading {
		align-items: center;
		margin-bottom: 1rem;
	}
	.panel-heading.compact {
		margin-bottom: 1.25rem;
	}
	h2 {
		margin: 0;
		font-size: 1.2rem;
		letter-spacing: -0.03em;
	}
	.capacity {
		padding: 0.4rem 0.65rem;
		border: 1px solid rgba(255, 230, 109, 0.4);
		border-radius: 999px;
		color: #ffe66d;
		font-size: 0.8rem;
		font-weight: 800;
	}
	.players {
		display: grid;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.players li {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		align-items: center;
		min-height: 4.25rem;
		padding: 0.8rem 0.9rem;
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 0.7rem;
		background: rgba(255, 255, 255, 0.04);
	}
	.players li.local {
		border-color: #ffe66d;
		box-shadow: inset 0.2rem 0 #ffe66d;
	}
	.player-identity {
		gap: 0.75rem;
		min-width: 0;
	}
	.player-identity > div {
		min-width: 0;
	}
	.player-identity strong {
		display: inline-block;
		max-width: 12rem;
		overflow: hidden;
		text-overflow: ellipsis;
		vertical-align: bottom;
		white-space: nowrap;
	}
	.player-meta {
		display: block;
		color: #aaa5c0;
		font-size: 0.8rem;
	}
	.you-badge {
		display: inline-block;
		margin-left: 0.35rem;
		padding: 0.15rem 0.35rem;
		border-radius: 0.25rem;
		background: rgba(255, 230, 109, 0.16);
		color: #ffe66d;
		font-size: 0.62rem;
		font-weight: 800;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		vertical-align: middle;
	}
	.empty-slot {
		justify-content: start !important;
		min-height: 3.25rem !important;
		border-style: dashed !important;
		color: #706b88;
		font-size: 0.85rem;
	}
	.empty-slot i {
		width: 0.5rem;
		height: 0.5rem;
		border: 1px solid #706b88;
		border-radius: 50%;
	}
	.ready-label.ready {
		color: #58e38c;
		font-weight: 800;
	}
	.ready-label {
		color: #aaa5c0;
		font-size: 0.8rem;
		font-weight: 700;
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
	.controls-column {
		display: grid;
		align-content: start;
		gap: 1rem;
	}
	.readiness-panel {
		border-color: rgba(255, 230, 109, 0.35);
		background: rgba(255, 230, 109, 0.06);
	}
	.readiness-panel.ready {
		border-color: rgba(88, 227, 140, 0.45);
		background: rgba(88, 227, 140, 0.06);
	}
	.readiness-panel h2 {
		font-size: 1.45rem;
	}
	.readiness-panel p:not(.card-label),
	.waiting-panel p {
		margin: 0.5rem 0 1.25rem;
		font-size: 0.88rem;
		line-height: 1.45;
	}
	.ready-button,
	.start-button {
		width: 100%;
	}
	.host-panel {
		background: rgba(255, 255, 255, 0.025);
	}
	.computer-controls {
		align-items: end;
		gap: 0.6rem;
	}
	.difficulty-picker {
		display: grid;
		gap: 0.25rem;
		flex: 1;
		color: #aaa5c0;
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.difficulty-picker select {
		padding: 0.7rem 2rem 0.7rem 0.75rem;
		border: 1px solid #68627e;
		border-radius: 0.5rem;
		background: #242039;
		color: #f4f1ff;
		font: inherit;
		font-weight: 600;
		letter-spacing: normal;
		text-transform: none;
	}
	.add-computer {
		white-space: nowrap;
	}
	.start-block {
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}
	.reason {
		margin: 0.65rem 0 0;
		color: #aaa5c0;
		font-size: 0.82rem;
		line-height: 1.35;
	}
	button.secondary {
		background: #9b8cff;
	}
	button.quiet {
		background: transparent;
		color: #c4c1d4;
		border: 1px solid #68627e;
	}
	.leave-button {
		align-self: end;
	}
	button:disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}
	.error {
		margin: 1rem 0 0;
		color: #ff9f9f;
		font-size: 0.85rem;
	}
	button:focus-visible {
		outline: 3px solid #f4f1ff;
		outline-offset: 2px;
	}
	@media (max-width: 760px) {
		.room-header,
		.invite-card {
			display: grid;
		}
		.header-actions {
			min-width: 0;
		}
		.invite-card button,
		.leave-button {
			width: 100%;
		}
		.leave-button {
			align-self: stretch;
		}
		.computer-controls {
			align-items: stretch;
			flex-direction: column;
		}
		.lobby-grid {
			grid-template-columns: 1fr;
			margin-top: 1.75rem;
		}
	}
</style>
