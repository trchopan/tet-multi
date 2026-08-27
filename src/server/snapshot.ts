import type { RoomSnapshot } from '$/shared/types';
import type { Room } from './room';

export const createRoomSnapshot = (
	room: Room,
	serverTime: number,
): RoomSnapshot => room.snapshot(serverTime);
