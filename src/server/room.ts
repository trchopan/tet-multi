import {
	MAX_PLAYERS_PER_ROOM,
	MIN_PLAYERS_TO_START,
} from '../shared/constants';
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
	private emptySince?: number;

	constructor(options: RoomOptions) {
		this.code = options.code;
		this.now = options.now ?? Date.now;
		this.createId = options.createId ?? (() => crypto.randomUUID());
		this.createSeed = options.createSeed ?? (() => crypto.randomUUID());
		this.createToken = options.createToken ?? createReconnectToken;
		this.reconnectGraceMs = options.reconnectGraceMs ?? 20_000;
		this.emptyTtlMs = options.emptyTtlMs ?? 300_000;
		this.createdAt = this.now();
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
		for (const session of this.sessions.values()) {
			session.ready = false;
			session.matchState = 'waiting';
		}
		this.broadcast({ type: 'room_snapshot', snapshot: this.snapshot(now) });
	}

	leave(playerId: string): void {
		const session = this.requireSession(playerId);
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
		session.matchState = this.phase === 'lobby' ? 'waiting' : 'disconnected';
		session.reconnectDeadline = now + this.reconnectGraceMs;
		delete session.socket;
		this.broadcast({ type: 'room_snapshot', snapshot: this.snapshot(now) });
	}

	update(now = this.now()): boolean {
		if (
			this.phase === 'countdown' &&
			this.countdownEndsAt !== undefined &&
			now >= this.countdownEndsAt
		) {
			this.phase = 'playing';
			this.serverTick += Math.max(
				1,
				Math.floor((now - this.createdAt) / (1000 / 60)),
			);
			if (this.matchId === undefined || this.matchSeed === undefined)
				throw new Error('Match is incomplete');
			this.broadcast({
				type: 'match_started',
				matchId: this.matchId,
				seed: this.matchSeed,
				startTick: this.serverTick,
				serverTime: now,
			});
			this.broadcast({ type: 'room_snapshot', snapshot: this.snapshot(now) });
		}
		let removedSession = false;
		for (const session of this.players) {
			if (
				session.reconnectDeadline !== undefined &&
				now >= session.reconnectDeadline
			) {
				this.sessions.delete(session.playerId);
				removedSession = true;
				if (session.playerId === this.hostPlayerId) this.migrateHost();
			}
		}
		if (removedSession && this.sessions.size > 0)
			this.broadcast({ type: 'room_snapshot', snapshot: this.snapshot(now) });
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
			players: this.players.map((session) => ({
				playerId: session.playerId,
				displayName: session.displayName,
				shortId: session.playerId.slice(0, 6),
				joinedAt: session.joinedAt,
				connected: session.connected,
				ready: session.ready,
				isHost: session.playerId === this.hostPlayerId,
				matchState: session.matchState,
			})),
		};
		if (this.countdownEndsAt !== undefined)
			snapshot.countdownEndsAt = this.countdownEndsAt;
		if (this.matchId !== undefined) snapshot.matchId = this.matchId;
		if (this.winnerPlayerIds !== undefined)
			snapshot.winnerPlayerIds = [...this.winnerPlayerIds];
		return snapshot;
	}

	acceptInput(playerId: string, _input: ClientInputMessage): void {
		this.requireSession(playerId);
		throw new RoomError('INVALID_PHASE');
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
		| 'NOT_READY';

	constructor(code: RoomError['code']) {
		super(code);
		this.code = code;
	}
}
