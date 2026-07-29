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
import { gameRegistry, type GameEngine } from '../games';

export interface RoomOptions {
	readonly code: string;
	readonly gameType?: string;
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
	readonly gameType: string;
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
	private genericEngine?: GameEngine;
	private readonly inputQueues = new Map<string, QueuedInput[]>();
	private readonly lastProcessedInput = new Map<string, number>();
	private readonly lastAcceptedInput = new Map<string, number>();
	private readonly inputWindows = new Map<
		string,
		{ last: number; tokens: number }
	>();
	private emptySince?: number;
	private lastLobbyHeartbeatAt: number;

	constructor(options: RoomOptions) {
		this.code = options.code;
		this.gameType = options.gameType ?? 'falling-blocks';
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

	/** Backward-compatibility hooks for inspection in tests */
	get engines(): Map<string, unknown> {
		return (this.genericEngine as any)?.engines ?? new Map();
	}

	get botControllers(): Map<string, unknown> {
		return (this.genericEngine as any)?.botControllers ?? new Map();
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
		delete this.genericEngine;
		this.inputQueues.clear();
		this.lastProcessedInput.clear();
		this.lastAcceptedInput.clear();
		this.inputWindows.clear();
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
			if (gameRegistry.has(this.gameType)) {
				this.genericEngine = gameRegistry.get(this.gameType).createEngine({
					matchId: this.matchId,
					seed: this.matchSeed,
					players: this.players.map((session) => ({
						playerId: session.playerId,
						displayName: session.displayName,
						playerType: session.playerType,
						computerDifficulty: session.computerDifficulty,
					})),
				});
			}
			for (const session of this.players) {
				session.matchState = session.connected ? 'playing' : 'disconnected';
				this.inputQueues.set(session.playerId, []);
				this.lastProcessedInput.set(session.playerId, 0);
				this.lastAcceptedInput.set(session.playerId, 0);
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
			gameType: this.gameType,
			phase: this.phase,
			hostPlayerId: this.hostPlayerId,
			serverTick: this.serverTick,
			serverTime,
			players: this.players.map((session) => this.playerSnapshot(session)),
		};
		if (this.genericEngine) {
			snapshot.customGameState = this.genericEngine.getPublicSnapshot();
		}
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
		if (!this.genericEngine) return;

		const inputsToProcess: {
			playerId: string;
			sequence: number;
			action: any;
		}[] = [];

		for (const session of this.players) {
			const queue = this.inputQueues.get(session.playerId);
			if (queue && queue.length > 0) {
				while (queue.length > 0) {
					const input = queue.shift()!;
					inputsToProcess.push({
						playerId: session.playerId,
						sequence: input.sequence,
						action: input.action,
					});
					this.lastProcessedInput.set(session.playerId, input.sequence);
				}
			}
		}

		this.genericEngine.tick(this.serverTick, inputsToProcess);

		const summaries = this.genericEngine.getPlayerSummaries();
		for (const [id, summary] of summaries) {
			const session = this.sessions.get(id);
			if (session) {
				if (session.matchState !== 'disconnected') {
					session.matchState = summary.matchState;
				}
			}
		}

		if (this.genericEngine.isFinished()) {
			this.finishMatch(this.genericEngine.getWinners());
			return;
		}

		if (
			this.phase === 'playing' &&
			this.serverTick % NORMAL_SNAPSHOT_INTERVAL_TICKS === 0
		) {
			this.broadcast({ type: 'room_snapshot', snapshot: this.snapshot(now) });
		}
	}

	private eliminate(playerIds: readonly string[]): void {
		if (this.phase !== 'playing' || !this.genericEngine) return;
		this.genericEngine.eliminatePlayers?.(playerIds);
		for (const playerId of playerIds) {
			const session = this.sessions.get(playerId);
			if (session !== undefined) session.matchState = 'eliminated';
		}
		if (this.genericEngine.isFinished()) {
			this.finishMatch(this.genericEngine.getWinners());
		}
	}

	private finishMatch(winnerPlayerIds: readonly string[]): void {
		this.phase = 'finished';
		this.winnerPlayerIds = [...winnerPlayerIds];
		this.broadcast({ type: 'room_snapshot', snapshot: this.snapshot() });
	}

	private playerSnapshot(session: Session): RoomSnapshot['players'][number] {
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
		};
		if (this.genericEngine) {
			const summary = this.genericEngine
				.getPlayerSummaries()
				.get(session.playerId);
			if (summary) {
				if (summary.score !== undefined) snapshot.score = summary.score;
				if (summary.placement !== undefined)
					snapshot.placement = summary.placement;
				if (summary.eliminatedAtTick !== undefined)
					snapshot.eliminatedAtTick = summary.eliminatedAtTick;
				if (summary.board !== undefined) snapshot.board = summary.board;
				if (summary.activePiece !== undefined)
					snapshot.activePiece = summary.activePiece;
				if (summary.hold !== undefined) snapshot.hold = summary.hold;
				if (summary.next !== undefined) snapshot.next = summary.next;
				if (summary.lines !== undefined) snapshot.lines = summary.lines;
				if (summary.level !== undefined) snapshot.level = summary.level;
				if (summary.combo !== undefined) snapshot.combo = summary.combo;
				if (summary.maxCombo !== undefined)
					snapshot.maxCombo = summary.maxCombo;
				if (summary.backToBack !== undefined)
					snapshot.backToBack = summary.backToBack;
				if (summary.attackSent !== undefined)
					snapshot.attackSent = summary.attackSent;
				if (summary.incomingGarbage !== undefined)
					snapshot.incomingGarbage = summary.incomingGarbage;
				if (summary.lastProcessedInput !== undefined)
					snapshot.lastProcessedInput = summary.lastProcessedInput;
			}
		}
		if (snapshot.lastProcessedInput === undefined) {
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
		if (this.phase !== 'playing' || !this.genericEngine) return;
		this.genericEngine.forceTestTopOut?.();
		if (this.genericEngine.isFinished()) {
			this.finishMatch(this.genericEngine.getWinners());
		}
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
