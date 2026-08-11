import type { Server } from 'socket.io';

/**
 * Socket registry. Deliberately dependency-free: notifications, intents,
 * matches and chat all push through here, and routing it via the gateway
 * module instead would make those imports circular.
 */
let io: Server | null = null;

export function setIo(server: Server) {
  io = server;
}

export function getIo(): Server | null {
  return io;
}

/** Every authenticated socket joins `user:{id}`, so this reaches all their devices. */
export const userRoom = (userId: string) => `user:${userId}`;
export const chatRoom = (roomId: string) => `chat:${roomId}`;

export function emitToUser(userId: string, event: string, payload: unknown) {
  io?.to(userRoom(userId)).emit(event, payload);
}

export function emitToRoom(roomId: string, event: string, payload: unknown) {
  io?.to(chatRoom(roomId)).emit(event, payload);
}
