import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '../constants/config';
import { getTokens } from './tokenStore';

let socket: Socket | null = null;

export async function connectSocket(): Promise<Socket | null> {
  const { accessToken } = await getTokens();
  if (!accessToken) return null;

  if (socket?.connected) return socket;

  socket?.close();
  socket = io(SOCKET_URL, {
    auth: { token: accessToken },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
  });

  // The handshake carries the access token, so a token that expired while the
  // app was backgrounded fails the reconnect. Re-read it before each retry.
  socket.io.on('reconnect_attempt', async () => {
    const { accessToken: fresh } = await getTokens();
    if (socket && fresh) socket.auth = { token: fresh };
  });

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  socket?.close();
  socket = null;
}

/** Subscribe helper that returns its own unsubscribe. */
export function onSocket<T>(event: string, handler: (payload: T) => void): () => void {
  socket?.on(event, handler as (...args: unknown[]) => void);
  return () => {
    socket?.off(event, handler as (...args: unknown[]) => void);
  };
}
