import Redis from 'ioredis';
import { env } from './env';

export const redis = new Redis(env.redisUrl, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

/** Separate connection — a subscriber cannot issue normal commands. */
export const redisSub = new Redis(env.redisUrl, { lazyConnect: true });
export const redisPub = new Redis(env.redisUrl, { lazyConnect: true });

redis.on('error', (err) => console.error('redis error:', err.message));

export async function connectRedis() {
  await redis.connect();
  await redisSub.connect();
  await redisPub.connect();
  console.log('✓ redis connected');
}

export async function disconnectRedis() {
  await Promise.allSettled([redis.quit(), redisSub.quit(), redisPub.quit()]);
}

/** Key patterns from spec §8 — kept in one place so TTLs never drift. */
export const keys = {
  userLocation: (userId: string) => `user:loc:${userId}`,
  intentBroadcast: (intentId: string) => `intent:broadcast:${intentId}`,
  session: (userId: string) => `session:${userId}`,
  postRateLimit: (userId: string) => `post:ratelimit:${userId}`,
  otp: (phone: string) => `otp:${phone}`,
  otpAttempts: (phone: string) => `otp:attempts:${phone}`,
  otpLockout: (phone: string) => `otp:lock:${phone}`,
  activeUsers: 'users:active',
  faceLiveness: (userId: string) => `face:live:${userId}`,
};
