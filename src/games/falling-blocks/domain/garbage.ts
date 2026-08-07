import {
	BOARD_INTERNAL_HEIGHT,
	BOARD_WIDTH,
	GARBAGE_ACTIVATION_TICKS,
} from '../constants';
import { addGarbage, type BoardState } from './board';

export interface GarbagePacket {
	lines: number;
	hole: number;
	readyTick: number;
}

const assertPacket = (packet: GarbagePacket): void => {
	if (
		!Number.isInteger(packet.lines) ||
		packet.lines < 1 ||
		packet.lines > BOARD_INTERNAL_HEIGHT
	)
		throw new RangeError('Garbage packet lines are outside the board range');
	if (
		!Number.isInteger(packet.hole) ||
		packet.hole < 0 ||
		packet.hole >= BOARD_WIDTH
	)
		throw new RangeError('Garbage packet hole is invalid');
	if (!Number.isInteger(packet.readyTick) || packet.readyTick < 0)
		throw new RangeError('Garbage packet ready tick is invalid');
};

export const createGarbagePacket = (
	lines: number,
	hole: number,
	createdTick: number,
	activationTicks = GARBAGE_ACTIVATION_TICKS,
): GarbagePacket => {
	if (!Number.isInteger(createdTick) || createdTick < 0)
		throw new RangeError('Created tick must be a non-negative integer');
	if (!Number.isInteger(activationTicks) || activationTicks < 0)
		throw new RangeError('Activation ticks must be a non-negative integer');
	const packet = { lines, hole, readyTick: createdTick + activationTicks };
	assertPacket(packet);
	return packet;
};

export const cloneGarbagePacket = (packet: GarbagePacket): GarbagePacket => ({
	...packet,
});

export const enqueueGarbage = (
	queue: GarbagePacket[],
	packet: GarbagePacket,
): void => {
	assertPacket(packet);
	queue.push(cloneGarbagePacket(packet));
};

export const cancelGarbage = (
	queue: GarbagePacket[],
	lines: number,
): number => {
	if (!Number.isInteger(lines) || lines < 0)
		throw new RangeError('Cancellation lines must be non-negative');
	let remaining = lines;
	while (remaining > 0 && queue.length > 0) {
		const packet = queue[0];
		if (packet === undefined) break;
		const cancelled = Math.min(remaining, packet.lines);
		packet.lines -= cancelled;
		remaining -= cancelled;
		if (packet.lines === 0) queue.shift();
	}
	return lines - remaining;
};

export const readyGarbage = (
	queue: readonly GarbagePacket[],
	currentTick: number,
): GarbagePacket[] => {
	if (!Number.isInteger(currentTick) || currentTick < 0)
		throw new RangeError('Current tick must be a non-negative integer');
	const ready: GarbagePacket[] = [];
	for (const packet of queue)
		if (packet.readyTick <= currentTick) ready.push(cloneGarbagePacket(packet));
	return ready;
};

export const removeReadyGarbage = (
	queue: GarbagePacket[],
	currentTick: number,
): GarbagePacket[] => {
	const ready = readyGarbage(queue, currentTick);
	if (ready.length === 0) return ready;
	const remaining = queue.filter((packet) => packet.readyTick > currentTick);
	queue.splice(0, queue.length, ...remaining);
	return ready;
};

export const applyGarbage = (
	board: BoardState,
	packets: readonly GarbagePacket[],
): boolean => {
	let topOut = false;
	for (const packet of packets)
		topOut = addGarbage(board, packet.lines, packet.hole) || topOut;
	return topOut;
};
