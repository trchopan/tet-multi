<script lang="ts">
	import HomeForm from '../lib/components/HomeForm.svelte';
	import {
		MultiplayerSession,
		saveDisplayName,
	} from '../lib/client/multiplayer-session.svelte';

	const session = new MultiplayerSession((roomCode) => {
		globalThis.location.href = `/room/${roomCode}`;
	});

	const create = (displayName: string): void => {
		saveDisplayName(displayName);
		session.createRoom(displayName);
	};
	const join = (displayName: string, roomCode: string): void => {
		saveDisplayName(displayName);
		session.joinRoom(roomCode, displayName);
	};
</script>

<svelte:head>
	<title>tet-multi | Multiplayer falling-block arena</title>
	<meta
		name="description"
		content="Create or join a tet-multi multiplayer room."
	/>
</svelte:head>

<main>
	<HomeForm onCreate={create} onJoin={join} />
	<p class="status" aria-live="polite">{session.error}</p>
	<footer class="project-links" aria-label="Project links">
		<a href="https://tet.chop.dev">tet.chop.dev</a>
		<a href="https://github.com/trchopan/tet-multi">GitHub</a>
	</footer>
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
		display: grid;
		place-items: center;
		padding: 1rem;
		background: radial-gradient(circle at 50% 0%, #292341, #10121c 60%);
	}
	.status {
		position: fixed;
		right: 1rem;
		bottom: 1rem;
		max-width: 24rem;
		color: #ff9f9f;
	}
	.project-links {
		position: fixed;
		left: 1rem;
		bottom: 1rem;
		display: flex;
		gap: 1rem;
	}
	.project-links a {
		color: #c8bfff;
	}
</style>
