<script lang="ts">
	import { validateDisplayName } from '../client/name';
	import { gameRegistry } from '../../games';

	let {
		title,
		description,
		submitLabel,
		initialName = '',
		isCreateMode = false,
		onSubmit,
	}: {
		title: string;
		description: string;
		submitLabel: string;
		initialName?: string;
		isCreateMode?: boolean;
		onSubmit: (displayName: string, gameType?: string) => void;
	} = $props();

	let displayName = $state('');
	let selectedGame = $state('falling-blocks');
	let error = $state('');
	let initialized = false;
	let nameEdited = false;
	const availableGames = gameRegistry.getAll();

	$effect(() => {
		if (!initialized || (!nameEdited && initialName.length > 0)) {
			displayName = initialName;
			initialized = true;
		}
	});

	const submit = (): void => {
		const validation = validateDisplayName(displayName);
		if (validation !== undefined) {
			error = validation;
			return;
		}
		const value = displayName.trim();
		error = '';
		onSubmit(value, isCreateMode ? selectedGame : undefined);
	};
</script>

<section class="entry-card" aria-labelledby="entry-title">
	<p class="eyebrow">Multiplayer Arena</p>
	<h1 id="entry-title">{title}</h1>
	<p class="lede">{description}</p>

	<label for="display-name">Display name</label>
	<input
		id="display-name"
		bind:value={displayName}
		autocomplete="nickname"
		aria-describedby="display-name-help"
		oninput={() => (nameEdited = true)}
		onkeydown={(event) => event.key === 'Enter' && submit()}
	/>
	<p id="display-name-help" class="field-help">
		1–20 visible Unicode characters
	</p>

	{#if isCreateMode}
		<label for="game-select">Select Game Plugin</label>
		<select id="game-select" bind:value={selectedGame}>
			{#each availableGames as game}
				<option value={game.id}>{game.name} ({game.viewMode})</option>
			{/each}
		</select>
		<p class="field-help">
			{availableGames.find((g) => g.id === selectedGame)?.description ?? ''}
		</p>
	{/if}

	<button type="button" onclick={submit}>{submitLabel}</button>
	<p class="error" aria-live="polite">{error}</p>
</section>

<style>
	.entry-card {
		width: min(100%, 38rem);
		margin: auto;
		padding: clamp(1.5rem, 5vw, 3rem);
		border: 1px solid rgba(255, 255, 255, 0.16);
		border-radius: 1.25rem;
		background: rgba(20, 18, 38, 0.88);
		box-shadow: 0 1.5rem 4rem rgba(0, 0, 0, 0.25);
	}
	.eyebrow,
	.error {
		color: #ffe66d;
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	h1 {
		margin: 0.3rem 0;
		font-size: clamp(2.5rem, 10vw, 5rem);
		letter-spacing: -0.08em;
	}
	.lede {
		color: #c4c1d4;
	}
	.field-help {
		margin: -0.7rem 0 1rem;
		color: #aaa5c0;
		font-size: 0.75rem;
	}
	label {
		font-size: 0.85rem;
		display: block;
		margin-top: 0.5rem;
	}
	input,
	select {
		width: 100%;
		margin: 0.4rem 0 1rem;
		padding: 0.8rem;
		border: 1px solid #68627e;
		border-radius: 0.5rem;
		background: #10121c;
		color: inherit;
		font: inherit;
	}
	button {
		width: 100%;
		padding: 1rem;
		border: 0;
		border-radius: 0.5rem;
		background: #6c5ce7;
		color: #fff;
		font-weight: 700;
		cursor: pointer;
	}
	button:hover {
		background: #5b4bc4;
	}
</style>
