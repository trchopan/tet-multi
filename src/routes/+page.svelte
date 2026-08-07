<script lang="ts">
	import HomeForm from '$/lib/components/HomeForm.svelte';

	const create = (): void => {
		globalThis.location.href = '/room/new';
	};
	const join = (roomCode: string): void => {
		globalThis.location.href = `/room/${roomCode}`;
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
