import crypto from 'crypto';
import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { keys, redis } from '../config/redis';

export interface AccessPayload {
  sub: string;
  username: string;
  tier: string;
  faceVerified: boolean;
}

export interface RefreshPayload {
  sub: string;
  jti: string;
  deviceId: string;
}

export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign(payload, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessExpiry,
  } as SignOptions);
}

export function verifyAccessToken(token: string): AccessPayload {
  return jwt.verify(token, env.jwt.accessSecret) as AccessPayload;
}

export function verifyRefreshToken(token: string): RefreshPayload {
  return jwt.verify(token, env.jwt.refreshSecret) as RefreshPayload;
}

const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

/**
 * Issues a refresh token and records its hash under `session:{userId}`
 * (spec §8). Stored as a hash keyed by deviceId so a user can stay signed in
 * on several devices while each device still gets strict rotation.
 */
export async function issueRefreshToken(
  userId: string,
  deviceId: string
): Promise<string> {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ sub: userId, jti, deviceId }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpiry,
  } as SignOptions);

  const key = keys.session(userId);
  await redis.hset(key, deviceId, hash(token));
  await redis.expire(key, 60 * 60 * 24 * 30);
  return token;
}

/** True only if this exact token is the device's current one. */
export async function isRefreshTokenCurrent(
  userId: string,
  deviceId: string,
  token: string
): Promise<boolean> {
  const stored = await redis.hget(keys.session(userId), deviceId);
  if (!stored) return false;
  // Constant-time compare so a timing oracle can't walk the hash.
  const a = Buffer.from(stored);
  const b = Buffer.from(hash(token));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function revokeRefreshToken(userId: string, deviceId: string) {
  await redis.hdel(keys.session(userId), deviceId);
}

export async function revokeAllSessions(userId: string) {
  await redis.del(keys.session(userId));
}

export function randomOtp(length = 6): string {
  const max = 10 ** length;
  return String(crypto.randomInt(0, max)).padStart(length, '0');
}

export const hashValue = hash;
