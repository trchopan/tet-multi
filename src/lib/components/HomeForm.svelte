<script lang="ts">
	let {
		onCreate,
		onJoin,
		initialName = '',
	}: {
		onCreate: (displayName: string) => void;
		onJoin: (displayName: string, roomCode: string) => void;
		initialName?: string;
	} = $props();

	let displayName = $state('');
	let roomCode = $state('');
	let error = $state('');
	let initialized = false;
	$effect(() => {
		if (!initialized) {
			displayName = initialName;
			initialized = true;
		}
	});

	const validName = (): string | undefined => {
		const value = displayName.trim();
		if (value.length < 1 || [...value].length > 20)
			return 'Choose a display name from 1 to 20 characters.';
		if (
			[...value].some((character) =>
				/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(character),
			)
		)
			return 'Display names cannot contain control characters.';
		return undefined;
	};

	const create = (): void => {
		const validation = validName();
		if (validation !== undefined) {
			error = validation;
			return;
		}
		error = '';
		onCreate(displayName.trim());
	};

	const join = (): void => {
		const validation = validName();
		if (validation !== undefined) {
			error = validation;
			return;
		}
		if (!/^[A-HJ-NP-Z2-9]{6}$/i.test(roomCode.trim())) {
			error = 'Enter a valid six-character room code.';
			return;
		}
		error = '';
		onJoin(displayName.trim(), roomCode.trim().toUpperCase());
	};
</script>

<section class="home-card" aria-labelledby="home-title">
	<p class="eyebrow">Multiplayer falling-block arena</p>
	<h1 id="home-title">tet-multi</h1>
	<p class="lede">Build a room, invite your crew, and outlast the stack.</p>

	<label for="display-name">Display name</label>
	<input
		id="display-name"
		bind:value={displayName}
		autocomplete="nickname"
		aria-describedby="display-name-help"
	/>
	<p id="display-name-help" class="field-help">
		1–20 visible Unicode characters
	</p>

	<div class="actions">
		<button type="button" onclick={create}>Create room</button>
		<div class="join-row">
			<label for="room-code">Room code</label>
			<input
				id="room-code"
				bind:value={roomCode}
				maxlength="6"
				autocomplete="off"
			/>
			<button class="secondary" type="button" onclick={join}>Join room</button>
		</div>
	</div>

	<p class="error" aria-live="polite">{error}</p>

	<div class="controls" aria-label="Keyboard controls">
		<strong>Controls</strong>
		<span>Arrows / A D move</span>
		<span>Down / S soft drop</span>
		<span>Space / W hard drop</span>
		<span>Up / X rotate, Z / Q counter-rotate</span>
		<span>C / Shift hold</span>
	</div>
</section>

<style>
	.home-card {
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
		font-size: clamp(3rem, 12vw, 6rem);
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
	label,
	.controls {
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
		padding: 0.8rem 1rem;
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
	.actions,
	.controls {
		display: grid;
		gap: 0.7rem;
	}
	.join-row {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.6rem;
		align-items: end;
	}
	.join-row label {
		grid-column: 1 / -1;
	}
	.join-row input {
		margin: 0;
	}
	.error {
		min-height: 1.2rem;
		color: #ff9f9f;
		letter-spacing: 0;
		text-transform: none;
	}
	.controls {
		grid-template-columns: repeat(2, 1fr);
		margin-top: 1.5rem;
		color: #aaa5c0;
	}
	.controls strong {
		grid-column: 1 / -1;
		color: #f4f1ff;
	}
	button:focus-visible,
	input:focus-visible {
		outline: 3px solid #f4f1ff;
		outline-offset: 2px;
	}
	@media (max-width: 480px) {
		.join-row,
		.controls {
			grid-template-columns: 1fr;
		}
		.join-row label,
		.controls strong {
			grid-column: auto;
		}
	}
</style>
