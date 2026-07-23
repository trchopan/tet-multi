import {
	MAX_PLAYERS_PER_ROOM,
	MAX_GAMEPLAY_INPUTS_PER_SECOND,
	GAMEPLAY_INPUT_BURST,
	MIN_PLAYERS_TO_START,
	NORMAL_SNAPSHOT_INTERVAL_TICKS,
} from '../shared/constants';
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
import { serializeBoard } from '../game/board';
import type {
	RoomSnapshot,
	ServerMessage,
	ClientInputMessage,
} from '../shared/types';
import {
	createReconnectToken,
	createSession,
	type Session,
	type SocketLike,
} from './session';

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
	private readonly inputQueues = new Map<string, ClientInputMessage[]>();
	private readonly lastProcessedInput = new Map<string, number>();
	private readonly lastAcceptedInput = new Map<string, number>();
	private readonly inputWindows = new Map<
		string,
		{ last: number; tokens: number }
	>();
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
			const session = this.players.find(
				(candidate) => candidate.reconnectToken === reconnectToken,
			);
			if (
				session === undefined ||
				(session.reconnectDeadline !== undefined &&
					session.reconnectDeadline < now)
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
			if (this.phase === 'playing' && session.matchState === 'disconnected')
				session.matchState = 'playing';
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
		this.lastProcessedInput.clear();
		this.lastAcceptedInput.clear();
		this.inputWindows.clear();
		this.pendingAttacks = [];
		for (const session of this.sessions.values()) {
			session.ready = false;
			session.matchState = 'waiting';
		}
		this.broadcast({ type: 'room_snapshot', snapshot: this.snapshot(now) });
	}

	leave(playerId: string): void {
		const session = this.requireSession(playerId);
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
		if (this.sessions.size === 0) this.emptySince = this.now();
		this.broadcast({ type: 'room_snapshot', snapshot: this.snapshot() });
	}

	disconnect(playerId: string, now = this.now(), socket?: SocketLike): void {
		const session = this.requireSession(playerId);
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
			}
			this.broadcast({
				type: 'match_started',
				matchId: this.matchId,
				seed: this.matchSeed,
				startTick: this.serverTick,
				serverTime: now,
			});
			this.broadcast({ type: 'room_snapshot', snapshot: this.snapshot(now) });
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
		return false;
	}

	snapshot(serverTime = this.now()): RoomSnapshot {
		const snapshot: RoomSnapshot = {
			protocolVersion: 1,
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
				applyInput(engine, input.action, false);
				this.lastProcessedInput.set(session.playerId, input.sequence);
				this.processPlacement(session.playerId, engine);
			}
			advanceTicks(engine, 1, false);
			this.processPlacement(session.playerId, engine);
			if (engine.gameOver) eliminated.push(session.playerId);
		}
		if (eliminated.length > 0) this.eliminate(eliminated);
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
		const outgoing = cancelIncomingGarbage(engine, placement.attack);
		if (outgoing > 0) {
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
		if (!result.finished) return;
		this.phase = 'finished';
		this.winnerPlayerIds = result.winnerPlayerIds;
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
			snapshot.backToBack = engine.backToBack;
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
		const next = this.players.find((session) => session.connected);
		this.hostPlayerId = next?.playerId ?? '';
		if (next !== undefined)
			this.broadcast({ type: 'room_snapshot', snapshot: this.snapshot() });
	}

	private broadcast(message: ServerMessage): void {
		const encoded = JSON.stringify(message);
		for (const session of this.sessions.values()) {
			if (session.connected && session.socket !== undefined)
				session.socket.send(encoded);
		}
	}
}

export class RoomError extends Error {
	readonly code:
		| 'NOT_JOINED'
		| 'NOT_HOST'
		| 'INVALID_PHASE'
		| 'INSUFFICIENT_PLAYERS'
		| 'NOT_READY'
		| 'RATE_LIMITED';

	constructor(code: RoomError['code']) {
		super(code);
		this.code = code;
	}
}
