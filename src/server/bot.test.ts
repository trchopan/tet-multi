import { describe, expect, test } from 'bun:test';
import { applyInput, createEngineState, hashEngineState } from '../game/engine';
import { createBotController, nextBotAction } from './bot';

const collectActions = (seed: string): string[] => {
	const engine = createEngineState(seed, 0);
	const controller = createBotController();
	const actions: string[] = [];
	for (let tick = 0; tick < 80; tick += 1) {
		const action = nextBotAction(controller, engine);
		if (action !== undefined) actions.push(action);
		if (actions.at(-1) === 'hard_drop') break;
	}
	return actions;
};

describe('computer player policy', () => {
	test('produces deterministic delayed placement actions', () => {
		const first = collectActions('bot-seed');
		expect(first).toEqual(collectActions('bot-seed'));
		expect(first.at(-1)).toBe('hard_drop');
		expect(first.length).toBeGreaterThan(1);
	});

	test('does not mutate the authoritative engine while planning', () => {
		const engine = createEngineState('bot-seed', 0);
		const before = hashEngineState(engine);
		nextBotAction(createBotController(), engine);
		expect(hashEngineState(engine)).toBe(before);
	});

	test('completes successive legal placements on the simulated board', () => {
		const engine = createEngineState('bot-stack-seed', 0);
		const controller = createBotController();
		let hardDrops = 0;
		for (let tick = 0; tick < 500 && hardDrops < 5; tick += 1) {
			const action = nextBotAction(controller, engine);
			if (action === undefined) continue;
			applyInput(engine, action, false);
			if (action === 'hard_drop') hardDrops += 1;
			expect(engine.gameOver).toBe(false);
		}
		expect(hardDrops).toBe(5);
	});
});
