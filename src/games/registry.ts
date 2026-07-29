import type { GamePlugin } from './types';

class GamePluginRegistry {
	private readonly plugins = new Map<string, GamePlugin>();

	register(plugin: GamePlugin): void {
		if (this.plugins.has(plugin.id)) {
			throw new Error(`Game plugin '${plugin.id}' is already registered.`);
		}
		this.plugins.set(plugin.id, plugin);
	}

	get(id: string): GamePlugin {
		const plugin = this.plugins.get(id);
		if (!plugin) {
			throw new Error(`Game plugin '${id}' is not registered.`);
		}
		return plugin;
	}

	has(id: string): boolean {
		return this.plugins.has(id);
	}

	getAll(): readonly GamePlugin[] {
		return Array.from(this.plugins.values());
	}
}

export const gameRegistry = new GamePluginRegistry();
