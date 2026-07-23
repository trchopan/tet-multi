<script lang="ts">
	import { onMount } from 'svelte';
	import GameGrid from '../../../lib/components/GameGrid.svelte';
	import Lobby from '../../../lib/components/Lobby.svelte';
	import HomeForm from '../../../lib/components/HomeForm.svelte';
	import Results from '../../../lib/components/Results.svelte';
	import {
		getStoredDisplayName,
		countdownLabel,
		MultiplayerSession,
		saveDisplayName,
	} from '../../../lib/client/multiplayer-session.svelte';
	import type { InputAction } from '../../../shared/types';
	import { page } from '$app/state';

	const code = $derived(page.params.code?.toUpperCase() ?? '');
	const session = new MultiplayerSession();
	let name = $state('');
	let now = $state(Date.now());
	let joined = $state(false);

	onMount(() => {
		name = getStoredDisplayName();
		if (name.length > 0) {
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
		session.joinRoom(code, displayName);
		joined = true;
	};
	const offset = $derived(session.serverOffsetMs);
	const countdownRemaining = $derived(
		session.snapshot?.countdownEndsAt === undefined
			? 0
			: session.snapshot.countdownEndsAt - (now + offset),
	);
	const countdownText = $derived(countdownLabel(countdownRemaining));

	const input = (action: InputAction): void => session.sendInput(action);
</script>

<svelte:head>
	<title>{code} | Neon Drop</title>
	<meta name="description" content={`Neon Drop room ${code}`} />
</svelte:head>

<main>
	{#if !joined}
		<HomeForm
			onCreate={connect}
			onJoin={(displayName, roomCode) =>
				roomCode === code && connect(displayName)}
			initialName={name}
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
		<section class="play-shell" aria-label="Neon Drop match">
			<header class="match-header">
				<div>
					<p class="eyebrow">Room {code}</p>
					<h1>
						{session.snapshot.phase === 'countdown'
							? 'Get ready'
							: 'Battle in progress'}
					</h1>
				</div>
				<span
					class="connection"
					role="status"
					aria-live="polite"
					aria-atomic="true"
					>{session.connectionState === 'connected'
						? 'Connected'
						: 'Connection lost'}</span
				>
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
	.connecting {
		width: min(100%, 34rem);
		margin: 15vh auto;
		padding: 2rem;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 1rem;
		background: rgba(20, 18, 38, 0.9);
		text-align: center;
	}
	.match-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		width: min(100%, 110rem);
		margin: 0 auto 1.5rem;
	}
	.eyebrow,
	.connection {
		color: #ffe66d;
		font-size: 0.78rem;
		font-weight: 800;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	h1 {
		margin: 0.3rem 0;
		font-size: clamp(2rem, 6vw, 4rem);
		letter-spacing: -0.06em;
	}
	.connection {
		color: #58e38c;
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
