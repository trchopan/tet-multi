<svelte:head>
	<title>Neon Drop</title>
	<meta
		name="description"
		content="A deterministic multiplayer falling-block game."
	/>
</svelte:head>

<main>
	<p class="eyebrow">Foundation online</p>
	<h1>Neon Drop</h1>
	<p class="intro">A fast, fair falling-block arena is taking shape.</p>
	<p class="status">Static client foundation ready.</p>
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
		place-content: center;
		gap: 1rem;
		padding: 2rem;
	}

	.eyebrow,
	.status {
		margin: 0;
		color: #9b8cff;
		font-size: 0.8rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	h1,
	.intro {
		margin: 0;
	}

	h1 {
		font-size: clamp(3rem, 12vw, 8rem);
		line-height: 0.9;
		letter-spacing: -0.08em;
	}

	.intro {
		max-width: 32rem;
		color: #c4c1d4;
		font-size: 1.2rem;
	}
</style>
