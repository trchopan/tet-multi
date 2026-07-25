<script lang="ts">
	import { onMount } from 'svelte';
	import GameGrid from '../../../lib/components/GameGrid.svelte';
	import Lobby from '../../../lib/components/Lobby.svelte';
	import RoomEntryForm from '../../../lib/components/RoomEntryForm.svelte';
	import Results from '../../../lib/components/Results.svelte';
	import {
		getStoredDisplayName,
		countdownLabel,
		MultiplayerSession,
		saveDisplayName,
	} from '../../../lib/client/multiplayer-session.svelte';
	import type { ComputerDifficulty, InputAction } from '../../../shared/types';
	import { page } from '$app/state';

	const code = $derived(page.params.code?.toUpperCase() ?? '');
	const createMode = $derived(code === 'NEW');
	const session = new MultiplayerSession((roomCode) => {
		if (createMode) globalThis.location.href = `/room/${roomCode}`;
	});
	let name = $state('');
	let now = $state(Date.now());
	let joined = $state(false);

	onMount(() => {
		name = getStoredDisplayName();
		if (!createMode && name.length > 0) {
			session.reconnect(code, name);
			joined = true;
		}
		const timer = window.setInterval(() => (now = Date.now()), 50);
		return () => {
			window.clearInterval(timer);
			session.dispose();
		};
	});

	const connect = (displayName: string): void => {
		name = displayName;
		saveDisplayName(displayName);
		if (createMode) session.createRoom(displayName);
		else session.joinRoom(code, displayName);
		joined = true;
	};
	const offset = $derived(session.serverOffsetMs);
	const countdownRemaining = $derived(
		session.snapshot?.countdownEndsAt === undefined
			? 0
			: session.snapshot.countdownEndsAt - (now + offset),
	);
	const countdownText = $derived(countdownLabel(countdownRemaining));
	const activeMatch = $derived(
		joined &&
			(session.snapshot?.phase === 'countdown' ||
				session.snapshot?.phase === 'playing'),
	);

	const input = (action: InputAction): void => session.sendInput(action);
</script>

<svelte:head>
	<title>{createMode ? 'Create room' : `${code} | tet-multi`}</title>
	<meta
		name="description"
		content={createMode ? 'Create a tet-multi room.' : `tet-multi room ${code}`}
	/>
</svelte:head>

<main class:match-page={activeMatch}>
	{#if !joined}
		<RoomEntryForm
			title={createMode ? 'Create your room' : `Join room ${code}`}
			description={createMode
				? 'Choose your display name, then invite your crew.'
				: 'Choose your display name to enter the waiting room.'}
			submitLabel={createMode ? 'Create room' : 'Join room'}
			initialName={name}
			onSubmit={connect}
		/>
	{:else if session.snapshot === undefined}
		<section class="connecting" aria-live="polite">
			<h1>Joining room {code}</h1>
			<p>
				{session.connectionState === 'connecting'
					? 'Connecting to the arena…'
					: 'Waiting for the room snapshot…'}
			</p>
			{#if session.connectionState === 'closed'}<button
					type="button"
					onclick={() => session.reconnect(code, name)}>Try again</button
				>{/if}
			<p class="error" aria-live="polite">{session.error}</p>
		</section>
	{:else if session.snapshot.phase === 'lobby'}
		<Lobby
			snapshot={session.snapshot}
			localPlayerId={session.playerId}
			onReady={(ready) => session.setReady(ready)}
			onStart={() => session.startMatch()}
			onAddComputer={(difficulty: ComputerDifficulty) =>
				session.addComputer(difficulty)}
			onRemoveComputer={(playerId) => session.removeComputer(playerId)}
			onLeave={() => session.leaveRoom()}
			error={session.error}
			connectionState={session.connectionState}
		/>
	{:else if session.snapshot.phase === 'finished'}
		<Results
			snapshot={session.snapshot}
			localPlayerId={session.playerId}
			onReturn={() => session.returnToLobby()}
			connectionState={session.connectionState}
		/>
	{:else}
		<section
			class="play-shell"
			aria-label="tet-multi match"
			data-match-id={session.snapshot.matchId}
		>
			<header class="match-header">
				<div>
					<p class="eyebrow">Room {code}</p>
				</div>
				<div class="network-state" role="status" aria-live="polite">
					<i
						aria-hidden="true"
						class:offline={session.connectionState !== 'connected'}
					></i>
					{session.connectionState === 'connected'
						? 'Online'
						: 'Connection issue'}
				</div>
			</header>
			{#if session.snapshot.phase === 'countdown'}<div
					class="countdown"
					aria-live="assertive"
				>
					{countdownText}
				</div>{/if}
			<GameGrid
				players={session.snapshot.players}
				localPlayerId={session.playerId}
				onInput={session.snapshot.phase === 'playing' ? input : undefined}
				renderPlayer={(player) => session.renderPlayer(player, now)}
			/>
			<p class="error" aria-live="polite">{session.error}</p>
		</section>
	{/if}
</main>

<style>
	:global(*) {
		box-sizing: border-box;
	}
	:global(body) {
		margin: 0;
		background: #10121c;
		color: #f4f1ff;
		font-family: system-ui, sans-serif;
	}
	main {
		min-height: 100vh;
		padding: clamp(1rem, 3vw, 2.5rem);
		background: radial-gradient(circle at 50% 0%, #292341, #10121c 60%);
	}
	main.match-page {
		height: 100dvh;
		min-height: 0;
		padding: max(0.5rem, env(safe-area-inset-top))
			max(0.5rem, env(safe-area-inset-right))
			max(0.5rem, env(safe-area-inset-bottom))
			max(0.5rem, env(safe-area-inset-left));
		overflow: hidden;
	}
	.connecting {
		width: min(100%, 34rem);
		margin: 15vh auto;
		padding: 2rem;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 1rem;
		background: rgba(20, 18, 38, 0.9);
		text-align: center;
	}
	.play-shell {
		height: 100%;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		min-height: 0;
		width: min(100%, 110rem);
		margin: auto;
	}
	.match-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		width: min(100%, 110rem);
		margin: 0 auto 0.25rem;
	}
	.network-state {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		color: #aaa5c0;
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.network-state i {
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 50%;
		background: #58e38c;
	}
	.network-state i.offline {
		background: #ff9f43;
	}
	.eyebrow {
		margin: 0;
		color: #ffe66d;
		font-size: 0.78rem;
		font-weight: 800;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.countdown {
		position: fixed;
		z-index: 2;
		inset: 0;
		display: grid;
		place-items: center;
		background: rgba(16, 18, 28, 0.65);
		color: #ffe66d;
		font-size: clamp(5rem, 20vw, 12rem);
		font-weight: 900;
		pointer-events: none;
	}
	.error {
		margin: 0.25rem 0 0;
		color: #ff9f9f;
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
	@media (prefers-reduced-motion: reduce) {
		.countdown {
			transition: none;
		}
	}
</style>
