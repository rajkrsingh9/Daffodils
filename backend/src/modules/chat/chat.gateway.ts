import type { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { env } from '../../config/env';
import { prisma } from '../../config/db';
import { chatRoom, setIo, userRoom } from '../../config/realtime';
import { verifyAccessToken } from '../../utils/tokens';
import * as chatService from './chat.service';

interface AuthedSocket extends Socket {
  userId?: string;
}

export function initChatGateway(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: { origin: env.corsOrigin, credentials: true },
    pingTimeout: 30_000,
  });

  // Same JWT as the REST API — a socket is never less authenticated.
  io.use((socket: AuthedSocket, next) => {
    const token =
      (socket.handshake.auth?.token as string | undefined) ??
      socket.handshake.headers.authorization?.replace('Bearer ', '');

    if (!token) return next(new Error('UNAUTHORIZED'));
    try {
      socket.userId = verifyAccessToken(token).sub;
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket: AuthedSocket) => {
    const userId = socket.userId!;
    socket.join(userRoom(userId));

    prisma.user
      .update({ where: { id: userId }, data: { lastActiveAt: new Date() } })
      .catch(() => undefined);

    /** Join a match conversation. Membership is re-checked server-side. */
    socket.on('room:join', async (roomId: string, ack?: (r: unknown) => void) => {
      try {
        const room = await chatService.getRoom(roomId, userId);
        socket.join(chatRoom(roomId));
        ack?.({ ok: true, room });
      } catch (err) {
        ack?.({ ok: false, error: (err as Error).message });
      }
    });

    socket.on('room:leave', (roomId: string) => {
      socket.leave(chatRoom(roomId));
    });

    socket.on(
      'message:send',
      async (
        payload: { roomId: string } & chatService.SendMessageInput,
        ack?: (r: unknown) => void
      ) => {
        try {
          const message = await chatService.sendMessage(payload.roomId, userId, payload);
          ack?.({ ok: true, message });
        } catch (err) {
          ack?.({ ok: false, error: (err as Error).message });
        }
      }
    );

    socket.on('message:read', async (roomId: string) => {
      await chatService.markRead(roomId, userId).catch(() => undefined);
    });

    socket.on('typing', (roomId: string, isTyping: boolean) => {
      socket.to(chatRoom(roomId)).emit('typing', { roomId, userId, isTyping });
    });

    socket.on('disconnect', () => {
      prisma.user
        .update({ where: { id: userId }, data: { lastActiveAt: new Date() } })
        .catch(() => undefined);
    });
  });

  setIo(io);
  console.log('✓ socket.io gateway ready');
  return io;
}
