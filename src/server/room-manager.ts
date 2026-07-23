import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../shared/constants';
import { Room, RoomError } from './room';
import { createReconnectToken, type Session, type SocketLike } from './session';

export interface RoomLogger {
	info(event: string, fields: Record<string, string | number>): void;
	warn(event: string, fields: Record<string, string | number>): void;
}

export interface RoomManagerOptions {
	readonly now?: () => number;
	readonly randomBytes?: (length: number) => Uint8Array;
	readonly createId?: () => string;
	readonly createSeed?: () => string;
	readonly createToken?: () => string;
	readonly logger?: RoomLogger;
}

const secureBytes = (length: number): Uint8Array => {
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	return bytes;
};

export class RoomManager {
	private readonly rooms = new Map<string, Room>();
	private readonly now: () => number;
	private readonly randomBytes: (length: number) => Uint8Array;
	private readonly createId: () => string;
	private readonly createSeed: () => string;
	private readonly createToken: () => string;
	private readonly logger: RoomLogger;

	constructor(options: RoomManagerOptions = {}) {
		this.now = options.now ?? Date.now;
		this.randomBytes = options.randomBytes ?? secureBytes;
		this.createId = options.createId ?? (() => crypto.randomUUID());
		this.createSeed = options.createSeed ?? (() => crypto.randomUUID());
		this.createToken = options.createToken ?? createReconnectToken;
		this.logger = options.logger ?? {
			info: (event, fields) =>
				console.info(JSON.stringify({ event, ...fields })),
			warn: (event, fields) =>
				console.warn(JSON.stringify({ event, ...fields })),
		};
	}

	get roomCount(): number {
		return this.rooms.size;
	}

	createRoom(
		clientId: string,
		displayName: string,
		socket: SocketLike,
	): { room: Room; session: Session } {
		let code = this.createCode();
		while (this.rooms.has(code)) code = this.createCode();
		const room = new Room({
			code,
			now: this.now,
			createId: this.createId,
			createSeed: this.createSeed,
			createToken: this.createToken,
		});
		const joined = room.join(clientId, displayName, socket);
		if (!joined.session || !joined.result.ok)
			throw new Error('Room creator could not join');
		this.rooms.set(code, room);
		this.logger.info('room_created', { roomCode: code });
		return { room, session: joined.session };
	}

	get(code: string): Room | undefined {
		return this.rooms.get(code.toUpperCase());
	}

	joinRoom(
		code: string,
		clientId: string,
		displayName: string,
		socket: SocketLike,
		reconnectToken?: string,
	): {
		room?: Room;
		session?: Session;
		error?:
			| 'ROOM_NOT_FOUND'
			| 'ROOM_FULL'
			| 'MATCH_IN_PROGRESS'
			| 'INVALID_RECONNECT_TOKEN'
			| 'INTERNAL_ERROR';
	} {
		const room = this.get(code);
		if (room === undefined) return { error: 'ROOM_NOT_FOUND' as const };
		const joined = room.join(
			clientId,
			displayName,
			socket,
			this.now(),
			reconnectToken,
		);
		if (!joined.result.ok) return { error: joined.result.code };
		if (joined.session === undefined) return { error: 'INTERNAL_ERROR' };
		this.logger.info('player_joined', { roomCode: room.code });
		return { room, session: joined.session };
	}

	fixedUpdate(now = this.now()): void {
		for (const [code, room] of [...this.rooms]) {
			if (room.update(now)) {
				this.rooms.delete(code);
				this.logger.info('room_deleted', { roomCode: code });
			}
		}
	}

	private createCode(): string {
		const bytes = this.randomBytes(ROOM_CODE_LENGTH);
		let code = '';
		for (const byte of bytes)
			code += ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length];
		return code;
	}
}

export const errorMessage = (
	error: string,
): { message: string; recoverable: boolean } => {
	const messages: Record<string, string> = {
		INVALID_MESSAGE: 'The message is invalid.',
		PROTOCOL_MISMATCH: 'This client uses an unsupported protocol version.',
		NOT_JOINED: 'Join a room first.',
		ROOM_NOT_FOUND: 'Room not found.',
		ROOM_FULL: 'Room is full.',
		MATCH_IN_PROGRESS: 'The match is already in progress.',
		INVALID_NAME: 'Choose a display name from 1 to 20 visible characters.',
		NOT_HOST: 'Only the host can perform that action.',
		NOT_READY: 'Every connected player must be ready.',
		INSUFFICIENT_PLAYERS: 'At least two connected players are required.',
		INVALID_PHASE: 'That action is not available right now.',
		INVALID_RECONNECT_TOKEN: 'The reconnect token is invalid or expired.',
		RATE_LIMITED: 'Too many requests.',
		INTERNAL_ERROR: 'The server could not complete that action.',
	};
	return {
		message:
			messages[error] ??
			messages.INTERNAL_ERROR ??
			'The server could not complete that action.',
		recoverable: error !== 'PROTOCOL_MISMATCH',
	};
};

export const roomErrorMessage = (error: unknown): string => {
	if (error instanceof RoomError) return error.code;
	if (
		error instanceof Error &&
		errorMessage(error.message).message !==
			errorMessage('INTERNAL_ERROR').message
	)
		return error.message;
	return 'INTERNAL_ERROR';
};
