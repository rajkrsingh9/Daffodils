import axios from 'axios';
import { env } from '../config/env';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
}

/**
 * Expo push. Expo caps a request at 100 messages, so a broadcast to a dense
 * area is chunked. Delivery failures never bubble up — a missed push must not
 * roll back the intent that triggered it.
 */
export async function sendPush(messages: PushMessage[]): Promise<number> {
  if (!messages.length) return 0;

  const valid = messages.filter((m) => m.to?.startsWith('ExponentPushToken'));
  if (!valid.length) {
    console.log(`[push:dev] ${messages.length} message(s) skipped (no valid tokens)`);
    return 0;
  }

  const chunks: PushMessage[][] = [];
  for (let i = 0; i < valid.length; i += 100) chunks.push(valid.slice(i, i + 100));

  let sent = 0;
  for (const chunk of chunks) {
    try {
      await axios.post(
        EXPO_PUSH_URL,
        chunk.map((m) => ({ sound: 'default', ...m })),
        {
          headers: {
            'Content-Type': 'application/json',
            ...(env.expoAccessToken
              ? { Authorization: `Bearer ${env.expoAccessToken}` }
              : {}),
          },
          timeout: 15_000,
        }
      );
      sent += chunk.length;
    } catch (err) {
      console.error('push chunk failed:', (err as Error).message);
    }
  }
  return sent;
}
