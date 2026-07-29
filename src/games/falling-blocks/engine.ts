import type {
	GameEngine,
	PlayerGameSummary,
	PlayerInputEnvelope,
} from '../types';
import {
	createEngineState,
	applyInput,
	advanceTicks,
	takeLastPlacement,
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
import { enqueueGarbage } from '../../game/garbage';
import { serializeBoard } from '../../game/board';
import type { InputAction } from '../../shared/types';

export class FallingBlocksGameEngine implements GameEngine<
	unknown,
	InputAction
> {
	private readonly match: MatchState;
	private readonly engines = new Map<string, GameEngineState>();
	private pendingAttacks: AttackPacket[] = [];
	private isGameOver = false;
	private winners: string[] = [];

	constructor(
		_matchId: string,
		seed: string,
		players: readonly { playerId: string; displayName: string }[],
	) {
		const roster = players.map((p) => p.playerId);
		this.match = createMatchState(seed, roster);
		for (let i = 0; i < roster.length; i++) {
			const id = roster[i]!;
			this.engines.set(id, createEngineState(seed, i));
		}
	}

	tick(
		serverTick: number,
		inputs: readonly PlayerInputEnvelope<InputAction>[],
	): void {
		if (this.isGameOver) return;

		// 1. Group inputs by player
		const inputsByPlayer = new Map<string, InputAction[]>();
		for (const env of inputs) {
			const arr = inputsByPlayer.get(env.playerId) ?? [];
			arr.push(env.action);
			inputsByPlayer.set(env.playerId, arr);
		}

		// 2. Process active players in order
		const newlyEliminated: string[] = [];

		for (const player of this.match.players) {
			if (player.eliminated) continue;
			const engine = this.engines.get(player.playerId);
			if (!engine) continue;

			const playerInputs = inputsByPlayer.get(player.playerId) ?? [];
			for (const action of playerInputs) {
				applyInput(engine, action);
			}

			advanceTicks(engine, 1);

			const placement = takeLastPlacement(engine);
			if (placement && placement.attack > 0) {
				const attack = createAttackPacket(
					this.match,
					player.playerId,
					placement.attack,
					serverTick,
				);
				if (attack) {
					this.pendingAttacks.push(attack);
				}
			}

			if (engine.gameOver) {
				newlyEliminated.push(player.playerId);
			}
		}

		// 3. Process attack cancellation & garbage enqueue
		this.pendingAttacks = retargetAttackPackets(
			this.match,
			this.pendingAttacks,
		);
		for (const packet of this.pendingAttacks) {
			const targetEngine = this.engines.get(packet.targetId);
			if (targetEngine) {
				enqueueGarbage(targetEngine.incomingGarbage, packet);
			}
		}
		this.pendingAttacks = [];

		// 4. Resolve garbage for remaining active players
		for (const player of this.match.players) {
			if (player.eliminated) continue;
			const engine = this.engines.get(player.playerId);
			if (!engine) continue;

			if (resolveReadyGarbage(engine)) {
				engine.gameOver = true;
				newlyEliminated.push(player.playerId);
			}
		}

		// 5. Process eliminations
		if (newlyEliminated.length > 0) {
			const result = eliminatePlayers(this.match, newlyEliminated, serverTick);
			if (result.finished) {
				this.isGameOver = true;
				this.winners = result.winnerPlayerIds;
			}
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
					maxCombo: engine.maxCombo,
					backToBack: engine.backToBack,
					incomingGarbage: engine.incomingGarbage.reduce(
						(acc, p) => acc + p.lines,
						0,
					),
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
