import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function required(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optional(key: string, fallback = ''): string {
  return process.env[key] ?? fallback;
}

function num(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  nodeEnv: optional('NODE_ENV', 'development'),
  isProd: optional('NODE_ENV', 'development') === 'production',
  port: num('PORT', 4000),
  corsOrigin: optional('CORS_ORIGIN', '*'),

  databaseUrl: required('DATABASE_URL'),
  redisUrl: optional('REDIS_URL', 'redis://localhost:6379'),

  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET', 'dev-access-secret-change-me'),
    refreshSecret: required('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me'),
    accessExpiry: optional('JWT_ACCESS_EXPIRY', '15m'),
    refreshExpiry: optional('JWT_REFRESH_EXPIRY', '30d'),
  },

  cloudinary: {
    cloudName: optional('CLOUDINARY_CLOUD_NAME'),
    apiKey: optional('CLOUDINARY_API_KEY'),
    apiSecret: optional('CLOUDINARY_API_SECRET'),
  },

  expoAccessToken: optional('EXPO_ACCESS_TOKEN'),

  twilio: {
    accountSid: optional('TWILIO_ACCOUNT_SID'),
    authToken: optional('TWILIO_AUTH_TOKEN'),
    fromNumber: optional('TWILIO_FROM_NUMBER'),
  },

  face: {
    // Pluggable provider: `local` (deterministic descriptor matching, dev/offline)
    // or `rekognition` (AWS) — see modules/face/face.service.ts
    provider: optional('FACE_PROVIDER', 'local'),
    // Cosine-distance threshold below which two descriptors are the same person.
    matchThreshold: num('FACE_MATCH_THRESHOLD', 0.38),
    // How long a passed liveness check stays valid before re-verification.
    livenessTtlSeconds: num('FACE_LIVENESS_TTL_SECONDS', 60 * 60 * 24 * 30),
  },

  limits: {
    postsPerDay: num('POSTS_PER_DAY', 3),
    generalRatePerMin: num('RATE_GENERAL_PER_MIN', 100),
    authRatePerMin: num('RATE_AUTH_PER_MIN', 10),
    otpTtlSeconds: num('OTP_TTL_SECONDS', 600),
    otpMaxAttempts: num('OTP_MAX_ATTEMPTS', 3),
    otpLockoutSeconds: num('OTP_LOCKOUT_SECONDS', 300),
    locationTtlSeconds: num('LOCATION_TTL_SECONDS', 300),
    broadcastSetTtlSeconds: num('BROADCAST_SET_TTL_SECONDS', 60 * 60 * 24),
    chatBufferHours: num('CHAT_BUFFER_HOURS', 2),
    activityDurationHours: num('ACTIVITY_DURATION_HOURS', 2),
    messageRetentionDays: num('MESSAGE_RETENTION_DAYS', 30),
    dislikeFlagCount: num('DISLIKE_FLAG_COUNT', 10),
    dislikeFlagUniqueUsers: num('DISLIKE_FLAG_UNIQUE_USERS', 5),
  },
} as const;

export type Env = typeof env;
