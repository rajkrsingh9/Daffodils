import bcrypt from 'bcryptjs';
import { prisma } from '../../config/db';
import { env } from '../../config/env';
import { keys, redis } from '../../config/redis';
import { badRequest, conflict, tooManyRequests, unauthorized } from '../../utils/errors';
import { clean } from '../../utils/sanitize';
import { sendSms } from '../../utils/sms';
import {
  hashValue,
  isRefreshTokenCurrent,
  issueRefreshToken,
  randomOtp,
  revokeRefreshToken,
  signAccessToken,
  verifyRefreshToken,
} from '../../utils/tokens';

const SALT_ROUNDS = 12;

export const publicUserSelect = {
  id: true,
  name: true,
  username: true,
  city: true,
  bio: true,
  avatarUrl: true,
  interestTags: true,
  trustTier: true,
  trustScore: true,
  activitiesDone: true,
  companionsMet: true,
  faceVerified: true,
  phoneVerified: true,
  createdAt: true,
} as const;

function tokensFor(user: {
  id: string;
  username: string;
  trustTier: string;
  faceVerified: boolean;
}) {
  return signAccessToken({
    sub: user.id,
    username: user.username,
    tier: user.trustTier,
    faceVerified: user.faceVerified,
  });
}

interface RegisterInput {
  phone?: string;
  email?: string;
  password: string;
  name: string;
  username: string;
  city?: string;
  deviceId: string;
  /** Issued by POST /auth/otp/verify when called before an account exists. */
  phoneProofToken?: string;
}

const phoneProofKey = (token: string) => `otp:proof:${token}`;

export async function register(input: RegisterInput) {
  if (!input.phone && !input.email) {
    throw badRequest('Provide a phone number or an email address');
  }

  // Onboarding verifies the phone (screen 2) before the profile exists
  // (screen 3), so a proof token carries that result into registration.
  let phoneVerified = false;
  if (input.phoneProofToken) {
    const provenPhone = await redis.get(phoneProofKey(input.phoneProofToken));
    if (!provenPhone) throw badRequest('Phone verification expired', 'PROOF_EXPIRED');
    if (input.phone && provenPhone !== input.phone) {
      throw badRequest('Phone number does not match the verified one', 'PROOF_MISMATCH');
    }
    input.phone = provenPhone;
    phoneVerified = true;
    await redis.del(phoneProofKey(input.phoneProofToken));
  }

  const username = input.username.toLowerCase();
  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { username },
        ...(input.phone ? [{ phone: input.phone }] : []),
        ...(input.email ? [{ email: input.email.toLowerCase() }] : []),
      ],
    },
    select: { username: true, phone: true, email: true },
  });

  if (existing) {
    if (existing.username === username) throw conflict('That username is taken');
    if (input.phone && existing.phone === input.phone)
      throw conflict('That phone number is already registered');
    throw conflict('That email is already registered');
  }

  const user = await prisma.user.create({
    data: {
      phone: input.phone ?? null,
      email: input.email?.toLowerCase() ?? null,
      passwordHash: await bcrypt.hash(input.password, SALT_ROUNDS),
      name: clean(input.name),
      username,
      city: input.city ? clean(input.city) : null,
      phoneVerified,
      trustTier: phoneVerified ? 'TIER_2' : 'TIER_1',
    },
    select: { ...publicUserSelect, phone: true, email: true },
  });

  const accessToken = tokensFor(user);
  const refreshToken = await issueRefreshToken(user.id, input.deviceId);

  return { user, accessToken, refreshToken };
}

interface LoginInput {
  identifier: string; // phone, email or username
  password: string;
  deviceId: string;
}

export async function login({ identifier, password, deviceId }: LoginInput) {
  const lower = identifier.toLowerCase();
  const user = await prisma.user.findFirst({
    where: {
      deletedAt: null,
      OR: [{ phone: identifier }, { email: lower }, { username: lower }],
    },
  });

  // Always run a hash comparison so a missing account and a wrong password
  // take the same amount of time.
  const hash = user?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
  const ok = await bcrypt.compare(password, hash);

  if (!user || !ok) throw unauthorized('Incorrect credentials', 'INVALID_CREDENTIALS');
  if (!user.isActive) throw unauthorized('This account is disabled', 'ACCOUNT_DISABLED');

  await prisma.user.update({
    where: { id: user.id },
    data: { lastActiveAt: new Date() },
  });

  const accessToken = tokensFor(user);
  const refreshToken = await issueRefreshToken(user.id, deviceId);

  return {
    user: await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { ...publicUserSelect, phone: true, email: true },
    }),
    accessToken,
    refreshToken,
  };
}

/** Rotation: the presented token is invalidated the moment a new one is issued. */
export async function refresh(token: string) {
  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw unauthorized('Invalid refresh token', 'INVALID_REFRESH_TOKEN');
  }

  const current = await isRefreshTokenCurrent(payload.sub, payload.deviceId, token);
  if (!current) {
    // Either a genuine stale token or a replay of a rotated one. Kill the
    // device session outright rather than guessing which.
    await revokeRefreshToken(payload.sub, payload.deviceId);
    throw unauthorized('Refresh token has been rotated', 'REFRESH_TOKEN_REUSED');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive) throw unauthorized('Account unavailable');

  const accessToken = tokensFor(user);
  const refreshToken = await issueRefreshToken(user.id, payload.deviceId);

  return { accessToken, refreshToken };
}

export async function logout(token: string) {
  try {
    const payload = verifyRefreshToken(token);
    await revokeRefreshToken(payload.sub, payload.deviceId);
  } catch {
    /* already invalid — logout is idempotent */
  }
  return { success: true };
}

// ────────────────────────────────────────────────────────────────── OTP ──

export async function sendOtp(phone: string) {
  const locked = await redis.get(keys.otpLockout(phone));
  if (locked) {
    const ttl = await redis.ttl(keys.otpLockout(phone));
    throw tooManyRequests(
      `Too many attempts. Try again in ${Math.ceil(ttl / 60)} minute(s).`,
      'OTP_LOCKED'
    );
  }

  const code = randomOtp(6);
  await redis.set(keys.otp(phone), hashValue(code), 'EX', env.limits.otpTtlSeconds);
  await redis.del(keys.otpAttempts(phone));

  const delivered = await sendSms(
    phone,
    `${code} is your Daffodils verification code. It expires in 10 minutes.`
  );

  return {
    sent: true,
    expiresInSeconds: env.limits.otpTtlSeconds,
    delivered,
    // Surfaced only in development so the flow is testable without a gateway.
    ...(env.isProd ? {} : { devCode: code }),
  };
}

/**
 * A correct OTP upgrades the account to trust tier 2 (spec §7).
 * Called without a session during onboarding, it instead returns a one-shot
 * proof token that POST /auth/register consumes.
 */
export async function verifyOtp(userId: string | null, phone: string, code: string) {
  const locked = await redis.get(keys.otpLockout(phone));
  if (locked) throw tooManyRequests('Too many attempts, try again shortly', 'OTP_LOCKED');

  const stored = await redis.get(keys.otp(phone));
  if (!stored) throw badRequest('Code expired — request a new one', 'OTP_EXPIRED');

  if (stored !== hashValue(code)) {
    const attempts = await redis.incr(keys.otpAttempts(phone));
    await redis.expire(keys.otpAttempts(phone), env.limits.otpTtlSeconds);

    if (attempts >= env.limits.otpMaxAttempts) {
      await redis.set(keys.otpLockout(phone), '1', 'EX', env.limits.otpLockoutSeconds);
      await redis.del(keys.otp(phone), keys.otpAttempts(phone));
      throw tooManyRequests(
        `Too many incorrect codes. Locked for ${env.limits.otpLockoutSeconds / 60} minutes.`,
        'OTP_LOCKED'
      );
    }

    throw badRequest(
      `Incorrect code. ${env.limits.otpMaxAttempts - attempts} attempt(s) left.`,
      'OTP_INVALID'
    );
  }

  await redis.del(keys.otp(phone), keys.otpAttempts(phone));

  if (!userId) {
    const proofToken = randomOtp(6) + Date.now().toString(36);
    await redis.set(phoneProofKey(proofToken), phone, 'EX', 900);
    return { verified: true, phoneProofToken: proofToken, expiresInSeconds: 900 };
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      phone,
      phoneVerified: true,
      trustTier: 'TIER_2',
    },
    select: { ...publicUserSelect, phone: true, email: true },
  });

  return { user, accessToken: tokensFor(user) };
}
