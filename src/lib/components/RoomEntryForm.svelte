<script lang="ts">
	import { validateDisplayName } from '../client/name';

	let {
		title,
		description,
		submitLabel,
		initialName = '',
		onSubmit,
	}: {
		title: string;
		description: string;
		submitLabel: string;
		initialName?: string;
		onSubmit: (displayName: string) => void;
	} = $props();

	let displayName = $state('');
	let error = $state('');
	let initialized = false;
	let nameEdited = false;
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
		onSubmit(value);
	};
</script>

<section class="entry-card" aria-labelledby="entry-title">
	<p class="eyebrow">Multiplayer falling-block arena</p>
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
	}
	input {
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
		padding: 0.8rem 1rem;
		border: 0;
		border-radius: 0.5rem;
		background: #ffe66d;
		color: #10121c;
		font: inherit;
		font-weight: 800;
		cursor: pointer;
	}
	.error {
		min-height: 1.2rem;
		color: #ff9f9f;
		letter-spacing: 0;
		text-transform: none;
	}
	button:focus-visible,
	input:focus-visible {
		outline: 3px solid #f4f1ff;
		outline-offset: 2px;
	}
</style>
