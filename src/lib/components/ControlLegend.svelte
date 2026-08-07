<script lang="ts">
	import type { GameControlBinding } from '$/games/types';

	let {
		controls = [],
		compact = false,
	}: {
		controls?: readonly GameControlBinding[] | undefined;
		compact?: boolean | undefined;
	} = $props();

	const formatKeyName = (key: string): string => {
		switch (key) {
			case 'ArrowUp':
				return '↑';
			case 'ArrowDown':
				return '↓';
			case 'ArrowLeft':
				return '←';
			case 'ArrowRight':
				return '→';
			case 'Space':
			case ' ':
				return 'Space';
			default:
				return key.toUpperCase();
		}
	};
</script>

<div class="control-legend" class:compact>
	<div class="legend-grid">
		{#each controls as binding (binding.action)}
			<div class="legend-item" data-action={binding.action}>
				<div class="keys">
					{#each binding.defaultKeys.slice(0, 2) as key}
						<kbd>{formatKeyName(key)}</kbd>
					{/each}
				</div>
				<span class="label">{binding.label}</span>
			</div>
		{/each}
	</div>
</div>

<style>
	.control-legend {
		width: 100%;
		padding: 0.6rem 0.75rem;
		border-radius: 0.75rem;
		background: rgba(16, 18, 28, 0.75);
		border: 1px solid rgba(255, 255, 255, 0.12);
		backdrop-filter: blur(8px);
	}
	.control-legend.compact {
		padding: 0.4rem 0.6rem;
		font-size: 0.75rem;
	}
	.legend-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 0.75rem;
		align-items: center;
		justify-content: center;
	}
	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		background: rgba(255, 255, 255, 0.04);
		padding: 0.2rem 0.45rem;
		border-radius: 0.4rem;
		border: 1px solid rgba(255, 255, 255, 0.08);
		transition: all 0.15s ease;
	}
	.legend-item:hover {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.18);
	}
	.keys {
		display: flex;
		gap: 0.15rem;
	}
	kbd {
		display: inline-grid;
		place-items: center;
		min-width: 1.25rem;
		height: 1.25rem;
		padding: 0 0.25rem;
		border-radius: 0.25rem;
		background: #252438;
		border: 1px solid #4a4563;
		box-shadow: 0 1px 0 rgba(0, 0, 0, 0.4);
		color: #ffe66d;
		font-family: ui-monospace, monospace;
		font-size: 0.68rem;
		font-weight: 700;
		text-transform: uppercase;
	}
	.label {
		color: #cbd5e1;
		font-size: 0.7rem;
		font-weight: 500;
		white-space: nowrap;
	}
	.compact .legend-item {
		padding: 0.15rem 0.35rem;
	}
	.compact kbd {
		min-width: 1.1rem;
		height: 1.1rem;
		font-size: 0.62rem;
	}
	.compact .label {
		font-size: 0.65rem;
	}
</style>
