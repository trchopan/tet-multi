import { safeParse } from 'valibot';
import { MAX_INBOUND_MESSAGE_BYTES, PROTOCOL_VERSION } from './constants';
import { ClientMessageSchema, ServerMessageSchema } from './schemas';
import type {
	ClientJoinRoomMessage,
	ClientMessage,
	ServerMessage,
} from './types';

export type ProtocolDecodeFailureCode = 'INVALID_MESSAGE' | 'PROTOCOL_MISMATCH';

export interface ProtocolDecodeFailure {
	success: false;
	code: ProtocolDecodeFailureCode;
	reason: string;
}

export interface ProtocolDecodeSuccess {
	success: true;
	message: ClientMessage;
}

export type ProtocolDecodeResult =
	ProtocolDecodeFailure | ProtocolDecodeSuccess;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const invalid = (reason: string): ProtocolDecodeFailure => ({
	success: false,
	code: 'INVALID_MESSAGE',
	reason,
});

export const decodeClientMessage = (raw: string): ProtocolDecodeResult => {
	// Avoid allocating an unbounded UTF-8 buffer for clearly oversized input.
	if (raw.length > MAX_INBOUND_MESSAGE_BYTES * 4) {
		return invalid('Message exceeds the maximum inbound size');
	}
	const byteLength = new TextEncoder().encode(raw).byteLength;
	if (byteLength > MAX_INBOUND_MESSAGE_BYTES) {
		return invalid('Message exceeds the maximum inbound size');
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw) as unknown;
	} catch {
		return invalid('Message is not valid JSON');
	}

	if (
		isRecord(parsed) &&
		parsed.type === 'hello' &&
		typeof parsed.protocolVersion === 'number' &&
		parsed.protocolVersion !== PROTOCOL_VERSION
	) {
		return {
			success: false,
			code: 'PROTOCOL_MISMATCH',
			reason: 'Unsupported protocol version',
		};
	}

	const result = safeParse(ClientMessageSchema, parsed);
	if (!result.success) {
		return invalid('Message failed protocol validation');
	}

	const message = result.output;
	if (message.type === 'join_room') {
		const normalizedMessage: ClientJoinRoomMessage = {
			type: message.type,
			requestId: message.requestId,
			roomCode: message.roomCode.toUpperCase(),
			displayName: message.displayName.trim(),
		};
		if (message.reconnectToken !== undefined) {
			normalizedMessage.reconnectToken = message.reconnectToken;
		}
		return {
			success: true,
			message: normalizedMessage,
		};
	}
	if (message.type === 'create_room') {
		return {
			success: true,
			message: { ...message, displayName: message.displayName.trim() },
		};
	}

	return { success: true, message: message as ClientMessage };
};

export const validateServerMessage = (
	message: unknown,
): message is ServerMessage => safeParse(ServerMessageSchema, message).success;

export const encodeServerMessage = (message: ServerMessage): string => {
	if (!validateServerMessage(message)) {
		throw new Error('Attempted to encode an invalid server message');
	}
	return JSON.stringify(message);
};
