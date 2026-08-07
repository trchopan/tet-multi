import { describe, expect, test } from 'bun:test';
import {
	advanceTicks,
	applyInput,
	cancelIncomingGarbage,
	createEngineState,
	enqueueGarbage,
	hashEngineState,
	resolveReadyGarbage,
	takeLastPlacement,
} from '../domain/core-engine';
import { createBotController, invalidateBotPlan, nextBotAction } from '../bot/bot';

const collectActions = (seed: string): string[] => {
	const engine = createEngineState(seed, 0);
	const controller = createBotController();
	const actions: string[] = [];
	for (let tick = 0; tick < 80; tick += 1) {
		const action = nextBotAction(controller, engine);
		if (action !== undefined) actions.push(action);
		if (actions.at(-1) === 'button_a') break;
	}
	return actions;
};

describe('computer player policy', () => {
	test('uses slower deterministic timing for lower difficulty levels', () => {
		const firstActionTick = (
			difficulty: 'beginner' | 'challenger' | 'legendary',
		) => {
			const engine = createEngineState('bot-seed', 0);
			const controller = createBotController('', 0, difficulty);
			for (let tick = 0; tick < 100; tick += 1) {
				if (nextBotAction(controller, engine) !== undefined) return tick;
				advanceTicks(engine, 1, false);
			}
			return -1;
		};

		expect(firstActionTick('beginner')).toBeGreaterThan(
			firstActionTick('challenger'),
		);
		expect(firstActionTick('challenger')).toBeGreaterThan(
			firstActionTick('legendary'),
		);
	});

	test('replays every difficulty deterministically with applied actions', () => {
		for (const difficulty of ['beginner', 'challenger', 'legendary'] as const) {
			const run = (): { actions: string[]; hash: string } => {
				const engine = createEngineState('difficulty-seed', 0);
				const controller = createBotController(
					'difficulty-match',
					1,
					difficulty,
				);
				const actions: string[] = [];
				for (let tick = 0; tick < 160; tick += 1) {
					const action = nextBotAction(controller, engine);
					if (action !== undefined) {
						actions.push(`${tick}:${action}`);
						applyInput(engine, action, false);
					}
					advanceTicks(engine, 1, false);
				}
				return { actions, hash: hashEngineState(engine) };
			};

			expect(run()).toEqual(run());
		}
	});

	test('keeps deterministic difficulty outcomes ordered across fixed seeds', () => {
		const metrics = (difficulty: 'beginner' | 'challenger' | 'legendary') => {
			let hardDrops = 0;
			let lines = 0;
			for (let seedIndex = 0; seedIndex < 5; seedIndex += 1) {
				const engine = createEngineState(`calibration-${seedIndex}`, 0);
				const controller = createBotController(
					'calibration-match',
					seedIndex,
					difficulty,
				);
				for (let tick = 0; tick < 1800 && !engine.gameOver; tick += 1) {
					const action = nextBotAction(controller, engine);
					if (action !== undefined) {
						applyInput(engine, action, false);
						if (action === 'button_a') hardDrops += 1;
					}
					advanceTicks(engine, 1, false);
				}
				lines += engine.lines;
			}
			return { hardDrops, lines };
		};

		const beginner = metrics('beginner');
		const challenger = metrics('challenger');
		const legendary = metrics('legendary');
		expect(beginner.hardDrops).toBeLessThan(challenger.hardDrops);
		expect(challenger.hardDrops).toBeLessThan(legendary.hardDrops);
		expect(beginner.lines).toBeLessThan(challenger.lines);
		expect(challenger.lines).toBeLessThan(legendary.lines);
	});

	test('paces actions at a human-like fixed-tick cadence', () => {
		const engine = createEngineState('bot-seed', 0);
		const controller = createBotController();
		const actionTicks: number[] = [];
		for (let tick = 0; tick < 100; tick += 1) {
			const action = nextBotAction(controller, engine);
			if (action !== undefined) {
				actionTicks.push(tick);
				applyInput(engine, action, false);
			}
			advanceTicks(engine, 1, false);
		}
		expect(actionTicks[0]).toBe(18);
		expect(
			actionTicks
				.slice(1)
				.every((tick, index) => tick - actionTicks[index]! >= 3),
		).toBe(true);
	});

	test('produces deterministic delayed placement actions', () => {
		const first = collectActions('bot-seed');
		expect(first).toEqual(collectActions('bot-seed'));
		expect(first.at(-1)).toBe('button_a');
		expect(first.length).toBeGreaterThan(1);
	});

	test('does not mutate the authoritative engine while planning', () => {
		const engine = createEngineState('bot-seed', 0);
		const before = hashEngineState(engine);
		nextBotAction(createBotController(), engine);
		expect(hashEngineState(engine)).toBe(before);
	});

	test('abandons a plan when gravity has already spawned another piece', () => {
		const engine = createEngineState('stale-plan-seed', 0);
		const controller = createBotController();
		for (let tick = 0; tick < 19; tick += 1) {
			const action = nextBotAction(controller, engine);
			if (action !== undefined) applyInput(engine, action, false);
			advanceTicks(engine, 1, false);
		}
		const decisionCount = controller.decisionCount;
		applyInput(engine, 'button_a', false);
		const actionAfterExternalLock = nextBotAction(controller, engine);
		const freshController = createBotController();
		freshController.cooldown = 0;
		freshController.decisionCount = decisionCount;
		const actionFromFreshPlan = nextBotAction(freshController, engine);
		expect(actionAfterExternalLock).toBe(actionFromFreshPlan);
	});

	test('clears all timing state when a planned action is rejected', () => {
		const controller = createBotController();
		controller.plan = ['left'];
		controller.cooldown = 12;
		controller.actionCooldown = 2;
		controller.plannedPieceKey = 'planned-piece';
		invalidateBotPlan(controller);
		expect(controller.plan).toEqual([]);
		expect(controller.cooldown).toBe(0);
		expect(controller.actionCooldown).toBe(0);
		expect(controller.plannedPieceKey).toBeUndefined();
	});

	test('completes successive legal placements on the simulated board', () => {
		const engine = createEngineState('bot-stack-seed', 0);
		const controller = createBotController();
		let hardDrops = 0;
		for (let tick = 0; tick < 500 && hardDrops < 5; tick += 1) {
			const action = nextBotAction(controller, engine);
			if (action === undefined) continue;
			applyInput(engine, action, false);
			if (action === 'button_a') hardDrops += 1;
			expect(engine.gameOver).toBe(false);
		}
		expect(hardDrops).toBe(5);
	});

	test('uses hold when it produces a stronger deterministic placement', () => {
		const engine = createEngineState('hold-seed-3', 0);
		const controller = createBotController();
		const actions: string[] = [];
		for (let tick = 0; tick < 100; tick += 1) {
			const action = nextBotAction(controller, engine);
			if (action !== undefined) {
				actions.push(action);
				applyInput(engine, action, false);
				if (action === 'button_a') break;
			}
			advanceTicks(engine, 1, false);
		}
		expect(actions[0]).toBe('button_y');
	});

	test('survives a sustained deterministic run across multiple seeds', () => {
		for (let seedIndex = 0; seedIndex < 5; seedIndex += 1) {
			const engine = createEngineState(`survival-${seedIndex}`, 0);
			const controller = createBotController();
			let hardDrops = 0;
			for (let tick = 0; tick < 1800 && hardDrops < 30; tick += 1) {
				const action = nextBotAction(controller, engine);
				if (action !== undefined) {
					applyInput(engine, action, false);
					if (action === 'button_a') hardDrops += 1;
				}
				advanceTicks(engine, 1, false);
			}
			expect(engine.gameOver).toBe(false);
			expect(hardDrops).toBeGreaterThanOrEqual(30);
		}
	});

	test('continues legal play while delayed garbage is delivered', () => {
		const engine = createEngineState('garbage-survival-seed', 0);
		const controller = createBotController('garbage-match', 1);
		enqueueGarbage(engine, 1, 5, engine.currentTick);
		let hardDrops = 0;
		const resolvePlacement = (): void => {
			const placement = takeLastPlacement(engine);
			if (placement === undefined) return;
			cancelIncomingGarbage(engine, placement.attack);
			if (resolveReadyGarbage(engine)) engine.gameOver = true;
		};

		for (let tick = 0; tick < 1200 && !engine.gameOver; tick += 1) {
			const action = nextBotAction(controller, engine);
			if (action !== undefined) {
				applyInput(engine, action, false);
				if (action === 'button_a') hardDrops += 1;
				resolvePlacement();
			}
			advanceTicks(engine, 1, false);
			resolvePlacement();
		}
		expect(engine.gameOver).toBe(false);
		expect(hardDrops).toBeGreaterThanOrEqual(15);
	});
});
