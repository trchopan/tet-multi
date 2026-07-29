import type {
	EngineInitPlayer,
	GameEngine,
	PlayerGameSummary,
	PlayerInputEnvelope,
} from '../types';
import {
	createEngineState,
	applyInput,
	advanceTicks,
	takeLastPlacement,
	cancelIncomingGarbage,
	enqueueGarbagePacket,
	resolveReadyGarbage,
	type GameEngineState,
} from '../../game/engine';
import {
	createAttackPacket,
	createMatchState,
	eliminatePlayers,
	retargetAttackPackets,
	type AttackPacket,
	type MatchState,
} from '../../game/match';
import {
	createBotController,
	invalidateBotPlan,
	nextBotAction,
	type BotController,
} from '../../server/bot';
import { serializeBoard } from '../../game/board';
import type { InputAction } from '../../shared/types';

export class FallingBlocksGameEngine implements GameEngine<
	unknown,
	InputAction
> {
	readonly match: MatchState;
	readonly engines = new Map<string, GameEngineState>();
	readonly botControllers = new Map<string, BotController>();
	private readonly attackSent = new Map<string, number>();
	private readonly lastProcessedInput = new Map<string, number>();
	private pendingAttacks: AttackPacket[] = [];
	private isGameOver = false;
	private winners: string[] = [];
	private currentTick = 0;

	constructor(
		_matchId: string,
		seed: string,
		players: readonly EngineInitPlayer[],
	) {
		const roster = players.map((p) => p.playerId);
		this.match = createMatchState(seed, roster);
		for (let i = 0; i < roster.length; i++) {
			const player = players[i]!;
			const engine = createEngineState(seed, i);
			this.engines.set(player.playerId, engine);
			this.attackSent.set(player.playerId, 0);
			this.lastProcessedInput.set(player.playerId, 0);

			if (player.playerType === 'computer') {
				this.botControllers.set(
					player.playerId,
					createBotController(seed, i, player.computerDifficulty),
				);
			}
		}
	}

	tick(
		serverTick: number,
		inputs: readonly PlayerInputEnvelope<InputAction>[],
	): void {
		if (this.isGameOver) return;
		this.currentTick = serverTick;

		// 1. Group human inputs by player
		const inputsByPlayer = new Map<string, InputAction[]>();
		for (const env of inputs) {
			const arr = inputsByPlayer.get(env.playerId) ?? [];
			arr.push(env.action);
			inputsByPlayer.set(env.playerId, arr);
			this.lastProcessedInput.set(
				env.playerId,
				Math.max(
					this.lastProcessedInput.get(env.playerId) ?? 0,
					env.sequence,
				),
			);
		}

		// 2. Generate computer inputs
		for (const player of this.match.players) {
			if (player.eliminated) continue;
			const controller = this.botControllers.get(player.playerId);
			const engine = this.engines.get(player.playerId);
			if (!controller || !engine) continue;

			const botAction = nextBotAction(controller, engine);
			if (botAction !== undefined) {
				const arr = inputsByPlayer.get(player.playerId) ?? [];
				arr.push(botAction);
				inputsByPlayer.set(player.playerId, arr);
				const currentSeq = this.lastProcessedInput.get(player.playerId) ?? 0;
				this.lastProcessedInput.set(player.playerId, currentSeq + 1);
			}
		}

		// 3. Process active players in order
		const newlyEliminated: string[] = [];

		for (const player of this.match.players) {
			if (player.eliminated) continue;
			const engine = this.engines.get(player.playerId);
			if (!engine) continue;

			const playerInputs = inputsByPlayer.get(player.playerId) ?? [];
			for (const action of playerInputs) {
				const applied = applyInput(engine, action, false);
				if (!applied) {
					const controller = this.botControllers.get(player.playerId);
					if (controller) invalidateBotPlan(controller);
				}
				this.processPlacement(player.playerId, engine, serverTick);
			}

			advanceTicks(engine, 1, false);
			this.processPlacement(player.playerId, engine, serverTick);

			if (engine.gameOver) {
				newlyEliminated.push(player.playerId);
			}
		}

		// 4. Retarget attack packets & enqueue garbage
		this.pendingAttacks = retargetAttackPackets(
			this.match,
			this.pendingAttacks,
		);
		for (const packet of this.pendingAttacks) {
			const targetEngine = this.engines.get(packet.targetId);
			if (targetEngine) {
				enqueueGarbagePacket(targetEngine, packet);
			}
		}
		this.pendingAttacks = [];

		// 5. Resolve ready garbage for remaining active players
		for (const player of this.match.players) {
			if (player.eliminated) continue;
			const engine = this.engines.get(player.playerId);
			if (!engine) continue;

			if (resolveReadyGarbage(engine)) {
				engine.gameOver = true;
				newlyEliminated.push(player.playerId);
			}
		}

		// 6. Process eliminations & match status
		if (newlyEliminated.length > 0) {
			this.eliminate(newlyEliminated, serverTick);
		} else {
			this.checkComputerOnlyMatch();
		}
	}

	private processPlacement(
		playerId: string,
		engine: GameEngineState,
		serverTick: number,
	): void {
		const placement = takeLastPlacement(engine);
		if (!placement) return;

		const cancelled = cancelIncomingGarbage(engine, placement.attack);
		const outgoing = placement.attack - cancelled;
		if (outgoing > 0) {
			this.attackSent.set(
				playerId,
				(this.attackSent.get(playerId) ?? 0) + outgoing,
			);
			const packet = createAttackPacket(
				this.match,
				playerId,
				outgoing,
				serverTick,
			);
			if (packet) {
				this.pendingAttacks.push(packet);
			}
		}
	}

	private eliminate(playerIds: readonly string[], serverTick: number): void {
		const result = eliminatePlayers(this.match, playerIds, serverTick);
		if (result.finished) {
			this.isGameOver = true;
			this.winners = result.winnerPlayerIds;
			return;
		}
		this.checkComputerOnlyMatch();
	}

	public eliminatePlayers(playerIds: readonly string[]): void {
		this.eliminate(playerIds, this.currentTick);
	}

	private checkComputerOnlyMatch(): void {
		if (this.isGameOver) return;
		const hasActiveHuman = this.match.players.some(
			(p) => !p.eliminated && !this.botControllers.has(p.playerId),
		);
		if (hasActiveHuman) return;

		const activeComputers = this.match.players.filter(
			(p) => !p.eliminated && this.botControllers.has(p.playerId),
		);
		if (activeComputers.length === 0) return;

		for (const computer of activeComputers) {
			computer.placement = 1;
		}
		this.isGameOver = true;
		this.winners = activeComputers.map((c) => c.playerId);
	}

	public forceTestTopOut(): void {
		const activePlayer = this.match.players.find((p) => !p.eliminated);
		if (!activePlayer) return;
		const engine = this.engines.get(activePlayer.playerId);
		if (engine) {
			engine.gameOver = true;
		}
	}

	getPublicSnapshot(): unknown {
		return undefined;
	}

	getPlayerSummaries(): Map<string, PlayerGameSummary> {
		const summaries = new Map<string, PlayerGameSummary>();
		for (const player of this.match.players) {
			const engine = this.engines.get(player.playerId);
			const matchState = player.eliminated ? 'eliminated' : 'playing';

			if (engine) {
				summaries.set(player.playerId, {
					playerId: player.playerId,
					matchState,
					score: engine.score,
					placement: player.placement,
					eliminatedAtTick: player.eliminatedAtTick,
					board: serializeBoard(engine.board),
					activePiece: engine.activePiece
						? {
								kind: engine.activePiece.kind,
								x: engine.activePiece.x,
								y: engine.activePiece.y,
								rotation: engine.activePiece.rotation,
							}
						: undefined,
					hold: engine.hold === null ? undefined : engine.hold,
					next: [...engine.next],
					lines: engine.lines,
					level: engine.level,
					combo: engine.combo,
					maxCombo: Math.max(0, engine.maxCombo),
					backToBack: engine.backToBack,
					attackSent: this.attackSent.get(player.playerId) ?? 0,
					incomingGarbage: engine.incomingGarbage.reduce(
						(acc, p) => acc + p.lines,
						0,
					),
					lastProcessedInput:
						this.lastProcessedInput.get(player.playerId) ?? 0,
				});
			} else {
				summaries.set(player.playerId, {
					playerId: player.playerId,
					matchState,
					score: 0,
					placement: player.placement,
					eliminatedAtTick: player.eliminatedAtTick,
				});
			}
		}
		return summaries;
	}

	isFinished(): boolean {
		return this.isGameOver;
	}

	getWinners(): string[] {
		return [...this.winners];
	}

	getHash(): string {
		let hashStr = `${this.isGameOver}:${this.winners.join(',')}`;
		for (const [id, engine] of this.engines) {
			hashStr += `;${id}:${engine.score}:${engine.lines}:${serializeBoard(engine.board).slice(0, 10).join(',')}`;
		}
		return hashStr;
	}
}
