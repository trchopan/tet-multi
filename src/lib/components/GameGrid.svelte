<script lang="ts">
	import type {
		InputAction,
		PlayerSnapshot,
		RoomSnapshot,
	} from '../../shared/types';
	import { gameRegistry } from '../../games';
	import { UnifiedInputController } from '../client/input';
	import PlayerCard from './PlayerCard.svelte';
	import SharedCanvas from './SharedCanvas.svelte';
	import VirtualGamepad from './VirtualGamepad.svelte';

	let {
		players,
		localPlayerId,
		snapshot,
		onInput,
		renderPlayer,
	}: {
		players: PlayerSnapshot[];
		localPlayerId: string;
		snapshot?: RoomSnapshot | undefined;
		onInput?: ((action: InputAction) => void) | undefined;
		renderPlayer: (player: PlayerSnapshot) => PlayerSnapshot;
	} = $props();

	let showOpponents = $state(false);
	let showGamepad = $state(false);
	let activeActions = $state(new Set<InputAction>());
	let controller: UnifiedInputController | undefined;

	const gameType = $derived(snapshot?.gameType ?? 'falling-blocks');
	const plugin = $derived(
		gameRegistry.has(gameType) ? gameRegistry.get(gameType) : undefined,
	);
	const isSharedCanvas = $derived(plugin?.viewMode === 'shared-canvas');

	const localPlayer = $derived(
		players.find((player) => player.playerId === localPlayerId),
	);
	const opponents = $derived(
		players.filter((player) => player.playerId !== localPlayerId),
	);

	$effect(() => {
		if (isSharedCanvas || onInput === undefined || !plugin) return;
		controller?.dispose();
		controller = new UnifiedInputController(
			plugin.controls,
			window,
			onInput,
			(newSet) => {
				activeActions = newSet;
			},
		);

		return () => {
			controller?.dispose();
			controller = undefined;
		};
	});
</script>

<section class="game-view" aria-label="Multiplayer game arena">
	{#if isSharedCanvas && snapshot}
		<SharedCanvas {snapshot} local={true} {onInput} />
	{:else}
		<div class="mobile-controls">
			<button
				type="button"
				class="controller-toggle"
				onclick={() => (showGamepad = !showGamepad)}
				aria-label={showGamepad ? 'Hide Controller' : 'Show Controller'}
			>
				🎮 Controls
			</button>
			<button
				type="button"
				aria-label={showOpponents ? 'Hide opponents' : 'Show opponents'}
				title={showOpponents ? 'Hide opponents' : 'Show opponents'}
				aria-expanded={showOpponents}
				aria-controls="opponent-boards"
				onclick={() => (showOpponents = !showOpponents)}
			>
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path
						d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm6-1a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 21a7 7 0 0 1 14 0H2Zm13.5-5.8A6.8 6.8 0 0 1 18 21h4a5 5 0 0 0-6.5-5.8Z"
					/>
				</svg>
			</button>
		</div>
		<div class="game-layout">
			<div class="local-column">
				{#if localPlayer !== undefined}
					<PlayerCard
						player={renderPlayer(localPlayer)}
						local
						{onInput}
						controls={plugin?.controls}
						{activeActions}
						onVirtualAction={(action) =>
							controller
								? controller.pressVirtualAction(action)
								: onInput?.(action)}
						onReleaseVirtualAction={(action) =>
							controller?.releaseVirtualAction(action)}
					/>
				{/if}
			</div>
			<aside
				id="opponent-boards"
				class="opponents"
				class:visible={showOpponents}
				aria-label="Opponent boards"
			>
				<div class="opponents-heading">
					<span>Opponents</span>
					<span>{opponents.length}</span>
				</div>
				<div class="opponent-list">
					{#each opponents as player (player.playerId)}
						<PlayerCard
							player={renderPlayer(player)}
							compact
							onInput={undefined}
						/>
					{/each}
				</div>
			</aside>
		</div>

		{#if onInput && plugin}
			<div class="dock-wrapper" class:mobile-only={!showGamepad}>
				<VirtualGamepad
					controls={plugin.controls}
					onAction={(action: InputAction) =>
						controller
							? controller.pressVirtualAction(action)
							: onInput?.(action)}
					onReleaseAction={(action: InputAction) =>
						controller?.releaseVirtualAction(action)}
					{activeActions}
					mode="fixed-dock"
					onClose={() => (showGamepad = false)}
				/>
			</div>
		{/if}
	{/if}
</section>

<style>
	.game-view {
		height: 100%;
		min-height: 0;
		width: min(100%, 110rem);
		margin: auto;
		position: relative;
	}
	.game-layout {
		height: 100%;
		min-height: 0;
		display: grid;
		grid-template-columns: minmax(0, 1.35fr) minmax(18rem, 0.65fr);
		gap: clamp(0.6rem, 1.5vw, 1rem);
	}
	.local-column {
		min-width: 0;
		min-height: 0;
		height: 100%;
		display: grid;
		grid-template-rows: minmax(0, 1fr);
		max-width: 58rem;
		width: 100%;
		margin: auto;
	}
	.opponents {
		min-width: 0;
		min-height: 0;
		overflow-x: hidden;
		overflow-y: auto;
		scrollbar-gutter: stable;
		border: 1px solid rgba(255, 255, 255, 0.16);
		border-radius: 0.85rem;
		background: rgba(16, 18, 28, 0.88);
		padding: 0.75rem;
	}
	.opponents-heading {
		display: flex;
		justify-content: space-between;
		padding-bottom: 0.5rem;
		margin-bottom: 0.5rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		font-size: 0.8rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: #94a3b8;
	}
	.opponent-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.mobile-controls {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}
	.controller-toggle {
		background: rgba(108, 92, 231, 0.25);
		border: 1px solid rgba(108, 92, 231, 0.5);
		color: #ffe66d;
		font-size: 0.78rem;
		font-weight: 700;
		padding: 0.4rem 0.75rem;
		border-radius: 0.5rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}
	.controller-toggle:hover {
		background: rgba(108, 92, 231, 0.4);
	}
	.dock-wrapper.mobile-only {
		display: none;
	}
	@media (max-width: 768px) {
		.dock-wrapper.mobile-only {
			display: block;
		}
		.game-layout {
			grid-template-columns: 1fr;
			padding-bottom: 7.5rem; /* Reserve space for fixed mobile bottom gamepad dock */
		}
		.opponents {
			display: none;
		}
		.opponents.visible {
			display: block;
			position: fixed;
			inset: 4rem 1rem 8rem;
			z-index: 50;
		}
	}
</style>
