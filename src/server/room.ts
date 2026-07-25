import {
	DEFAULT_COMPUTER_DIFFICULTY,
	MAX_PLAYERS_PER_ROOM,
	MAX_COMPUTER_PLAYERS_PER_ROOM,
	MAX_GAMEPLAY_INPUTS_PER_SECOND,
	GAMEPLAY_INPUT_BURST,
	MIN_PLAYERS_TO_START,
	NORMAL_SNAPSHOT_INTERVAL_TICKS,
	PROTOCOL_VERSION,
} from '../shared/constants';
import type { ComputerDifficulty } from '../shared/types';
import {
	applyInput,
	advanceTicks,
	cancelIncomingGarbage,
	createEngineState,
	enqueueGarbagePacket,
	resolveReadyGarbage,
	takeLastPlacement,
	type GameEngineState,
} from '../game/engine';
import {
	createAttackPacket,
	createMatchState,
	eliminatePlayers,
	retargetAttackPackets,
	type AttackPacket,
	type MatchState,
} from '../game/match';
import {
	createBotController,
	invalidateBotPlan,
	nextBotAction,
	type BotController,
} from './bot';
import { serializeBoard } from '../game/board';
import type {
	RoomSnapshot,
	ServerMessage,
	ClientInputMessage,
} from '../shared/types';
import {
	createReconnectToken,
	createComputerSession,
	reconnectTokensEqual,
	createSession,
	type Session,
	type SocketLike,
} from './session';
import { sendServerMessage } from './socket-sender';

export interface RoomOptions {
	readonly code: string;
	readonly now?: () => number;
	readonly createId?: () => string;
	readonly createSeed?: () => string;
	readonly createToken?: () => string;
	readonly reconnectGraceMs?: number;
	readonly emptyTtlMs?: number;
}

export type RoomActionResult =
	| { ok: true }
	| {
			ok: false;
			code: 'ROOM_FULL' | 'MATCH_IN_PROGRESS' | 'INVALID_RECONNECT_TOKEN';
	  };

interface QueuedInput {
	sequence: number;
	action: ClientInputMessage['action'];
}

const MATCH_COUNTDOWN_MS = 3000;

export class Room {
	readonly code: string;
	readonly createdAt: number;
	private readonly now: () => number;
	private readonly createId: () => string;
	private readonly createSeed: () => string;
	private readonly createToken: () => string;
	private readonly reconnectGraceMs: number;
	private readonly emptyTtlMs: number;
	private readonly sessions = new Map<string, Session>();
	private hostPlayerId: string;
	private phase: RoomSnapshot['phase'] = 'lobby';
	private serverTick = 0;
	private countdownEndsAt?: number;
	private matchId?: string;
	private matchSeed?: string;
	private winnerPlayerIds?: string[];
	private match?: MatchState;
	private readonly engines = new Map<string, GameEngineState>();
	private readonly inputQueues = new Map<string, QueuedInput[]>();
	private readonly botControllers = new Map<string, BotController>();
	private readonly lastProcessedInput = new Map<string, number>();
	private readonly lastAcceptedInput = new Map<string, number>();
	private readonly inputWindows = new Map<
		string,
		{ last: number; tokens: number }
	>();
	private readonly attackSent = new Map<string, number>();
	private pendingAttacks: AttackPacket[] = [];
	private emptySince?: number;
	private lastLobbyHeartbeatAt: number;

	constructor(options: RoomOptions) {
		this.code = options.code;
		this.now = options.now ?? Date.now;
		this.createId = options.createId ?? (() => crypto.randomUUID());
		this.createSeed = options.createSeed ?? (() => crypto.randomUUID());
		this.createToken = options.createToken ?? createReconnectToken;
		this.reconnectGraceMs = options.reconnectGraceMs ?? 20_000;
		this.emptyTtlMs = options.emptyTtlMs ?? 300_000;
		this.createdAt = this.now();
		this.lastLobbyHeartbeatAt = this.createdAt;
		this.hostPlayerId = '';
	}

	get playerCount(): number {
		return this.sessions.size;
	}

	get computerCount(): number {
		return this.players.filter((session) => session.playerType === 'computer')
			.length;
	}

	get currentPhase(): RoomSnapshot['phase'] {
		return this.phase;
	}

	get players(): readonly Session[] {
		return [...this.sessions.values()].sort((a, b) => a.joinedAt - b.joinedAt);
	}

	join(
		clientId: string,
		displayName: string,
		socket: SocketLike,
		now = this.now(),
		reconnectToken?: string,
	): { session?: Session; result: RoomActionResult } {
		if (reconnectToken !== undefined) {
			const session = this.players.find((candidate) =>
				reconnectTokensEqual(candidate.reconnectToken, reconnectToken),
			);
			if (
				session === undefined ||
				(session.reconnectDeadline !== undefined &&
					session.reconnectDeadline <= now)
			)
				return { result: { ok: false, code: 'INVALID_RECONNECT_TOKEN' } };
			if (session.socket !== undefined && session.socket !== socket)
				session.socket.close(4001, 'Session replaced');
			session.socket = socket;
			session.connected = true;
			const matchPlayer = this.match?.players.find(
				(player) => player.playerId === session.playerId,
			);
			if (matchPlayer !== undefined) matchPlayer.connected = true;
			if (session.matchState === 'disconnected') {
				if (this.phase === 'playing') session.matchState = 'playing';
				else if (this.phase === 'countdown' || this.phase === 'finished')
					session.matchState = 'waiting';
			}
			delete session.reconnectDeadline;
			if (this.hostPlayerId === '') this.hostPlayerId = session.playerId;
			return { session, result: { ok: true } };
		}

		if (this.phase !== 'lobby')
			return { result: { ok: false, code: 'MATCH_IN_PROGRESS' } };
		if (this.sessions.size >= MAX_PLAYERS_PER_ROOM)
			return { result: { ok: false, code: 'ROOM_FULL' } };
		const session = createSession({
			playerId: this.createId(),
			clientId,
			displayName,
			roomCode: this.code,
			reconnectToken: this.createToken(),
			joinedAt: now,
			socket,
		});
		this.sessions.set(session.playerId, session);
		if (this.hostPlayerId === '') this.hostPlayerId = session.playerId;
		delete this.emptySince;
		return { session, result: { ok: true } };
	}

	addComputer(
		playerId: string,
		difficulty: ComputerDifficulty = DEFAULT_COMPUTER_DIFFICULTY,
		now = this.now(),
	): Session {
		this.requireHost(playerId);
		if (this.phase !== 'lobby') throw new RoomError('INVALID_PHASE');
		if (this.sessions.size >= MAX_PLAYERS_PER_ROOM)
			throw new RoomError('ROOM_FULL');
		if (this.computerCount >= MAX_COMPUTER_PLAYERS_PER_ROOM)
			throw new RoomError('COMPUTER_LIMIT');
		const computer = createComputerSession({
			playerId: this.createId(),
			displayName: `CPU ${this.computerCount + 1}`,
			roomCode: this.code,
			joinedAt: now,
			difficulty,
		});
		this.sessions.set(computer.playerId, computer);
		this.broadcast({ type: 'room_snapshot', snapshot: this.snapshot(now) });
		return computer;
	}

	removeComputer(playerId: string, computerId: string, now = this.now()): void {
		this.requireHost(playerId);
		if (this.phase !== 'lobby') throw new RoomError('INVALID_PHASE');
		const computer = this.sessions.get(computerId);
		if (computer === undefined || computer.playerType !== 'computer')
			throw new RoomError('INVALID_PLAYER');
		this.sessions.delete(computerId);
		this.broadcast({ type: 'room_snapshot', snapshot: this.snapshot(now) });
	}

	setReady(playerId: string, ready: boolean): void {
		const session = this.requireSession(playerId);
		if (this.phase !== 'lobby') throw new RoomError('INVALID_PHASE');
		session.ready = ready;
		this.broadcast({ type: 'room_snapshot', snapshot: this.snapshot() });
	}

	start(playerId: string, now = this.now()): void {
		this.requireHost(playerId);
		if (this.phase !== 'lobby') throw new RoomError('INVALID_PHASE');
		const connected = this.players.filter((session) => session.connected);
		if (connected.length < MIN_PLAYERS_TO_START)
			throw new RoomError('INSUFFICIENT_PLAYERS');
		if (!connected.every((session) => session.ready))
			throw new RoomError('NOT_READY');
		this.phase = 'countdown';
		this.countdownEndsAt = now + MATCH_COUNTDOWN_MS;
		this.matchId = this.createId();
		this.matchSeed = this.createSeed();
		delete this.winnerPlayerIds;
		this.broadcast({
			type: 'room_snapshot',
			snapshot: this.snapshot(now),
		});
	}

	returnToLobby(playerId: string, now = this.now()): void {
		this.requireHost(playerId);
		if (this.phase !== 'finished' && this.phase !== 'playing')
			throw new RoomError('INVALID_PHASE');
		this.phase = 'lobby';
		delete this.countdownEndsAt;
		delete this.matchId;
		delete this.matchSeed;
		delete this.winnerPlayerIds;
		delete this.match;
		this.engines.clear();
		this.inputQueues.clear();
		this.botControllers.clear();
		this.lastProcessedInput.clear();
		this.lastAcceptedInput.clear();
		this.inputWindows.clear();
		this.attackSent.clear();
		this.pendingAttacks = [];
		for (const session of this.sessions.values()) {
			session.ready = session.playerType === 'computer';
			session.matchState = 'waiting';
		}
		this.broadcast({ type: 'room_snapshot', snapshot: this.snapshot(now) });
	}

	leave(playerId: string): void {
		const session = this.requireSession(playerId);
		if (session.playerType === 'computer')
			throw new RoomError('INVALID_PLAYER');
		if (this.phase === 'playing') {
			const matchPlayer = this.match?.players.find(
				(player) => player.playerId === playerId,
			);
			if (matchPlayer !== undefined) matchPlayer.connected = false;
			this.eliminate([playerId]);
		}
		this.sessions.delete(playerId);
		delete session.socket;
		if (playerId === this.hostPlayerId) this.migrateHost();
		this.removeComputersIfNoHumanPresence(this.now());
		if (this.sessions.size === 0) this.emptySince = this.now();
		this.broadcast({ type: 'room_snapshot', snapshot: this.snapshot() });
	}

	disconnect(playerId: string, now = this.now(), socket?: SocketLike): void {
		const session = this.requireSession(playerId);
		if (session.playerType === 'computer') return;
		if (socket !== undefined && session.socket !== socket) return;
		session.connected = false;
		const matchPlayer = this.match?.players.find(
			(player) => player.playerId === session.playerId,
		);
		if (matchPlayer !== undefined) matchPlayer.connected = false;
		session.matchState = this.phase === 'lobby' ? 'waiting' : 'disconnected';
		session.reconnectDeadline = now + this.reconnectGraceMs;
		delete session.socket;
		this.broadcast({ type: 'room_snapshot', snapshot: this.snapshot(now) });
	}

	update(now = this.now()): boolean {
		const wasCountdown = this.phase === 'countdown';
		if (
			this.phase === 'countdown' &&
			this.countdownEndsAt !== undefined &&
			now >= this.countdownEndsAt
		) {
			this.phase = 'playing';
			if (this.matchId === undefined || this.matchSeed === undefined)
				throw new Error('Match is incomplete');
			this.match = createMatchState(
				this.matchSeed,
				this.players.map((session) => session.playerId),
			);
			for (const [rosterIndex, session] of this.players.entries()) {
				this.engines.set(
					session.playerId,
					createEngineState(this.matchSeed, rosterIndex),
				);
				const matchPlayer = this.match.players[rosterIndex];
				if (matchPlayer !== undefined)
					matchPlayer.connected = session.connected;
				session.matchState = session.connected ? 'playing' : 'disconnected';
				this.inputQueues.set(session.playerId, []);
				this.lastProcessedInput.set(session.playerId, 0);
				this.lastAcceptedInput.set(session.playerId, 0);
				this.attackSent.set(session.playerId, 0);
				if (session.playerType === 'computer')
					this.botControllers.set(
						session.playerId,
						createBotController(
							this.matchSeed,
							rosterIndex,
							session.computerDifficulty,
						),
					);
			}
			this.broadcast({
				type: 'match_started',
				matchId: this.matchId,
				seed: this.matchSeed,
				startTick: this.serverTick,
				serverTime: now,
			});
			this.broadcast(
				{ type: 'room_snapshot', snapshot: this.snapshot(now) },
				false,
			);
		}
		if (this.phase === 'playing' && !wasCountdown) this.simulateTick(now);
		let removedSession = false;
		const expiredMatchPlayers: string[] = [];
		for (const session of this.players) {
			if (
				session.reconnectDeadline !== undefined &&
				now >= session.reconnectDeadline
			) {
				if (this.phase === 'playing') {
					delete session.reconnectDeadline;
					session.connected = false;
					const matchPlayer = this.match?.players.find(
						(player) => player.playerId === session.playerId,
					);
					if (matchPlayer !== undefined) matchPlayer.connected = false;
					if (session.playerId === this.hostPlayerId) this.migrateHost();
					expiredMatchPlayers.push(session.playerId);
					continue;
				}
				this.sessions.delete(session.playerId);
				removedSession = true;
				if (session.playerId === this.hostPlayerId) this.migrateHost();
			}
		}
		if (expiredMatchPlayers.length > 0) this.eliminate(expiredMatchPlayers);
		if (removedSession && this.sessions.size > 0)
			this.broadcast({ type: 'room_snapshot', snapshot: this.snapshot(now) });
		if (
			this.phase === 'lobby' &&
			this.sessions.size > 0 &&
			now - this.lastLobbyHeartbeatAt >= 5000
		) {
			this.lastLobbyHeartbeatAt = now;
			this.broadcast({ type: 'room_snapshot', snapshot: this.snapshot(now) });
		}
		if (this.sessions.size === 0) {
			this.emptySince ??= now;
			return now - this.emptySince >= this.emptyTtlMs;
		}
		this.removeComputersIfNoHumanPresence(now);
		return false;
	}

	snapshot(serverTime = this.now()): RoomSnapshot {
		const snapshot: RoomSnapshot = {
			protocolVersion: PROTOCOL_VERSION,
			roomCode: this.code,
			phase: this.phase,
			hostPlayerId: this.hostPlayerId,
			serverTick: this.serverTick,
			serverTime,
			players: this.players.map((session) => this.playerSnapshot(session)),
		};
		if (this.countdownEndsAt !== undefined)
			snapshot.countdownEndsAt = this.countdownEndsAt;
		if (this.matchId !== undefined) snapshot.matchId = this.matchId;
		if (this.winnerPlayerIds !== undefined)
			snapshot.winnerPlayerIds = [...this.winnerPlayerIds];
		return snapshot;
	}

	acceptInput(
		playerId: string,
		input: ClientInputMessage,
		now = this.now(),
	): void {
		const session = this.requireSession(playerId);
		if (this.phase !== 'playing' || input.matchId !== this.matchId)
			throw new RoomError('INVALID_PHASE');
		if (
			session.matchState === 'eliminated' ||
			session.matchState === 'disconnected'
		)
			return;
		const previous = this.inputWindows.get(playerId) ?? {
			last: now,
			tokens: MAX_GAMEPLAY_INPUTS_PER_SECOND + GAMEPLAY_INPUT_BURST,
		};
		const elapsed = Math.max(0, now - previous.last);
		const current = {
			last: now,
			tokens: Math.min(
				MAX_GAMEPLAY_INPUTS_PER_SECOND + GAMEPLAY_INPUT_BURST,
				previous.tokens + (elapsed * MAX_GAMEPLAY_INPUTS_PER_SECOND) / 1000,
			),
		};
		if (current.tokens < 1) {
			this.inputWindows.set(playerId, current);
			throw new RoomError('RATE_LIMITED');
		}
		current.tokens -= 1;
		this.inputWindows.set(playerId, current);
		const lastProcessed = this.lastProcessedInput.get(playerId) ?? 0;
		const lastAccepted = this.lastAcceptedInput.get(playerId) ?? 0;
		const queue = this.inputQueues.get(playerId);
		if (input.sequence <= lastProcessed || input.sequence <= lastAccepted)
			return;
		if (queue === undefined) throw new RoomError('INVALID_PHASE');
		queue.push({ ...input });
		queue.sort((first, second) => first.sequence - second.sequence);
		this.lastAcceptedInput.set(playerId, input.sequence);
	}

	private simulateTick(now: number): void {
		this.serverTick += 1;
		const eliminated: string[] = [];
		const ordered = this.players.filter(
			(session) => session.matchState !== 'eliminated',
		);
		for (const session of ordered) {
			if (session.playerType !== 'computer') continue;
			const engine = this.engines.get(session.playerId);
			const controller = this.botControllers.get(session.playerId);
			const queue = this.inputQueues.get(session.playerId);
			if (
				engine === undefined ||
				controller === undefined ||
				queue === undefined
			)
				continue;
			const action = nextBotAction(controller, engine);
			if (action !== undefined) {
				const sequence =
					(this.lastAcceptedInput.get(session.playerId) ?? 0) + 1;
				queue.push({ sequence, action });
				this.lastAcceptedInput.set(session.playerId, sequence);
			}
		}
		for (const session of ordered) {
			const engine = this.engines.get(session.playerId);
			const queue = this.inputQueues.get(session.playerId);
			if (engine === undefined || queue === undefined) continue;
			while (queue.length > 0) {
				const input = queue.shift();
				if (input === undefined) break;
				if (
					input.sequence <= (this.lastProcessedInput.get(session.playerId) ?? 0)
				)
					continue;
				const applied = applyInput(engine, input.action, false);
				if (!applied && session.playerType === 'computer') {
					const controller = this.botControllers.get(session.playerId);
					if (controller !== undefined) invalidateBotPlan(controller);
				}
				this.lastProcessedInput.set(session.playerId, input.sequence);
				this.processPlacement(session.playerId, engine);
			}
			advanceTicks(engine, 1, false);
			this.processPlacement(session.playerId, engine);
			if (engine.gameOver) eliminated.push(session.playerId);
		}
		if (eliminated.length > 0) {
			this.eliminate(eliminated);
			if (this.phase !== 'playing') return;
		}
		this.pendingAttacks = retargetAttackPackets(
			this.match!,
			this.pendingAttacks,
		);
		for (const packet of this.pendingAttacks) {
			const target = this.engines.get(packet.targetId);
			if (target !== undefined) enqueueGarbagePacket(target, packet);
		}
		this.pendingAttacks = [];
		if (
			this.phase === 'playing' &&
			this.serverTick % NORMAL_SNAPSHOT_INTERVAL_TICKS === 0
		)
			this.broadcast({ type: 'room_snapshot', snapshot: this.snapshot(now) });
	}

	private processPlacement(playerId: string, engine: GameEngineState): void {
		const placement = takeLastPlacement(engine);
		if (placement === undefined || this.match === undefined) return;
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
				this.serverTick,
			);
			if (packet !== undefined) this.pendingAttacks.push(packet);
		}
		if (resolveReadyGarbage(engine)) engine.gameOver = true;
	}

	private eliminate(playerIds: readonly string[]): void {
		if (this.match === undefined || this.phase !== 'playing') return;
		const result = eliminatePlayers(this.match, playerIds, this.serverTick);
		for (const playerId of playerIds) {
			const session = this.sessions.get(playerId);
			if (session !== undefined) session.matchState = 'eliminated';
		}
		if (result.finished) {
			this.finishMatch(result.winnerPlayerIds);
			return;
		}
		this.finishComputerOnlyMatch();
	}

	private finishComputerOnlyMatch(): void {
		if (this.match === undefined || this.phase !== 'playing') return;
		if (
			this.players.some(
				(session) =>
					session.playerType === 'human' && session.matchState !== 'eliminated',
			)
		)
			return;
		const winners = this.match.players.filter(
			(player) =>
				!player.eliminated &&
				this.sessions.get(player.playerId)?.playerType === 'computer',
		);
		if (winners.length === 0) return;
		for (const winner of winners) winner.placement = 1;
		this.finishMatch(winners.map((winner) => winner.playerId));
	}

	private finishMatch(winnerPlayerIds: readonly string[]): void {
		this.phase = 'finished';
		this.winnerPlayerIds = [...winnerPlayerIds];
		this.broadcast({ type: 'room_snapshot', snapshot: this.snapshot() });
	}

	private playerSnapshot(session: Session): RoomSnapshot['players'][number] {
		const engine = this.engines.get(session.playerId);
		const player = this.match?.players.find(
			(candidate) => candidate.playerId === session.playerId,
		);
		const snapshot: RoomSnapshot['players'][number] = {
			playerId: session.playerId,
			displayName: session.displayName,
			shortId: session.playerId.slice(0, 6),
			playerType: session.playerType,
			...(session.computerDifficulty === undefined
				? {}
				: { computerDifficulty: session.computerDifficulty }),
			joinedAt: session.joinedAt,
			connected: session.connected,
			ready: session.ready,
			isHost: session.playerId === this.hostPlayerId,
			matchState: session.matchState,
			...(player?.placement === undefined
				? {}
				: { placement: player.placement }),
			...(player?.eliminatedAtTick === undefined
				? {}
				: { eliminatedAtTick: player.eliminatedAtTick }),
		};
		if (engine !== undefined) {
			snapshot.board = serializeBoard(engine.board);
			snapshot.activePiece = { ...engine.activePiece };
			if (engine.hold !== null) snapshot.hold = engine.hold;
			snapshot.next = [...engine.next];
			snapshot.score = engine.score;
			snapshot.lines = engine.lines;
			snapshot.level = engine.level;
			snapshot.combo = engine.combo;
			snapshot.maxCombo = Math.max(0, engine.maxCombo);
			snapshot.backToBack = engine.backToBack;
			snapshot.attackSent = this.attackSent.get(session.playerId) ?? 0;
			snapshot.incomingGarbage = engine.incomingGarbage.reduce(
				(sum, packet) => sum + packet.lines,
				0,
			);
			snapshot.lastProcessedInput =
				this.lastProcessedInput.get(session.playerId) ?? 0;
		}
		return snapshot;
	}

	notify(): void {
		this.broadcast({ type: 'room_snapshot', snapshot: this.snapshot() });
	}

	/** Test-only fixture hook; production HTTP never exposes this method. */
	forceTestTopOut(): void {
		const player = this.players.find(
			(session) => session.matchState !== 'eliminated',
		);
		if (this.phase !== 'playing' || player === undefined) return;
		const engine = this.engines.get(player.playerId);
		if (engine !== undefined) engine.gameOver = true;
	}

	private requireSession(playerId: string): Session {
		const session = this.sessions.get(playerId);
		if (session === undefined) throw new RoomError('NOT_JOINED');
		return session;
	}

	private requireHost(playerId: string): void {
		this.requireSession(playerId);
		if (playerId !== this.hostPlayerId) throw new RoomError('NOT_HOST');
	}

	private migrateHost(): void {
		const next = this.players.find(
			(session) => session.playerType === 'human' && session.connected,
		);
		this.hostPlayerId = next?.playerId ?? '';
		if (next !== undefined)
			this.broadcast({ type: 'room_snapshot', snapshot: this.snapshot() });
	}

	private removeComputersIfNoHumanPresence(now: number): void {
		const hasHumanPresence = this.players.some(
			(session) =>
				session.playerType === 'human' &&
				(session.connected ||
					(session.reconnectDeadline !== undefined &&
						session.reconnectDeadline > now)),
		);
		if (hasHumanPresence) return;
		for (const session of this.players) {
			if (session.playerType === 'computer')
				this.sessions.delete(session.playerId);
		}
	}

	private broadcast(message: ServerMessage, replaceable = false): void {
		for (const session of this.sessions.values()) {
			if (session.connected && session.socket !== undefined)
				sendServerMessage(session.socket, message, replaceable);
		}
	}
}

export class RoomError extends Error {
	readonly code:
		| 'NOT_JOINED'
		| 'NOT_HOST'
		| 'ROOM_FULL'
		| 'INVALID_PHASE'
		| 'INSUFFICIENT_PLAYERS'
		| 'NOT_READY'
		| 'RATE_LIMITED'
		| 'COMPUTER_LIMIT'
		| 'INVALID_PLAYER';

	constructor(code: RoomError['code']) {
		super(code);
		this.code = code;
	}
}
