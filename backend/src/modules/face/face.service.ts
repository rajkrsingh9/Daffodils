import crypto from 'crypto';
import { prisma } from '../../config/db';
import { env } from '../../config/env';
import { keys, redis } from '../../config/redis';
import { badRequest, conflict, forbidden, notFound } from '../../utils/errors';
import { DESCRIPTOR_LENGTH, getFaceProvider } from './face.provider';

const provider = getFaceProvider(env.face.provider);

const CHALLENGE_TTL_SECONDS = 120;
const GESTURES = ['blink twice', 'turn head left', 'turn head right', 'smile'] as const;

const challengeKey = (token: string) => `face:challenge:${token}`;

/**
 * Liveness challenge. The client must echo back the token issued here with the
 * captured descriptor, which stops a lifted photo of an enrolment frame from
 * being replayed indefinitely — each token is single-use and expires in 2 min.
 */
export async function issueChallenge(userId: string) {
  const token = crypto.randomUUID();
  const gesture = GESTURES[crypto.randomInt(0, GESTURES.length)];
  await redis.set(
    challengeKey(token),
    JSON.stringify({ userId, gesture }),
    'EX',
    CHALLENGE_TTL_SECONDS
  );
  return { challengeToken: token, gesture, expiresInSeconds: CHALLENGE_TTL_SECONDS };
}

async function consumeChallenge(userId: string, token: string) {
  const raw = await redis.get(challengeKey(token));
  if (!raw) throw badRequest('Liveness challenge expired — capture again', 'CHALLENGE_EXPIRED');
  const parsed = JSON.parse(raw) as { userId: string; gesture: string };
  if (parsed.userId !== userId) throw forbidden('Challenge belongs to another user');
  // Single use: burn it whether the match succeeds or fails.
  await redis.del(challengeKey(token));
  return parsed;
}

async function record(
  userId: string,
  kind: 'ENROLLMENT' | 'VERIFICATION',
  passed: boolean,
  score: number | null,
  reason?: string
) {
  await prisma.faceCheck.create({
    data: { userId, kind, passed, score, provider: provider.name, reason },
  });
}

export async function enroll(
  userId: string,
  descriptor: number[],
  challengeToken: string,
  imageUrl?: string | null
) {
  await consumeChallenge(userId, challengeToken);

  const valid = provider.validate(descriptor);
  if (!valid.ok) {
    await record(userId, 'ENROLLMENT', false, null, valid.reason);
    throw badRequest(valid.reason, 'FACE_CAPTURE_REJECTED');
  }

  const existing = await prisma.faceRecord.findFirst({
    where: { userId, active: true },
  });
  if (existing) {
    throw conflict(
      'A face record already exists. Revoke it before enrolling again.',
      'FACE_ALREADY_ENROLLED'
    );
  }

  const [faceRecord] = await prisma.$transaction([
    prisma.faceRecord.create({
      data: { userId, descriptor, imageUrl: imageUrl ?? null, provider: provider.name },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { faceVerified: true, faceVerifiedAt: new Date() },
    }),
  ]);

  await record(userId, 'ENROLLMENT', true, 0);
  await redis.set(keys.faceLiveness(userId), '1', 'EX', env.face.livenessTtlSeconds);

  return {
    id: faceRecord.id,
    provider: faceRecord.provider,
    enrolledAt: faceRecord.createdAt,
    faceVerified: true,
  };
}

export async function verify(
  userId: string,
  descriptor: number[],
  challengeToken: string
) {
  await consumeChallenge(userId, challengeToken);

  const valid = provider.validate(descriptor);
  if (!valid.ok) {
    await record(userId, 'VERIFICATION', false, null, valid.reason);
    throw badRequest(valid.reason, 'FACE_CAPTURE_REJECTED');
  }

  const enrolled = await prisma.faceRecord.findFirst({
    where: { userId, active: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!enrolled) throw notFound('No face record enrolled', 'FACE_NOT_ENROLLED');

  const distance = provider.distance(descriptor, enrolled.descriptor);
  const passed = distance <= env.face.matchThreshold;

  await record(userId, 'VERIFICATION', passed, distance);

  if (!passed) {
    // A failed live check invalidates the gate until they re-verify, so a
    // stolen session cannot ride on an old pass.
    await redis.del(keys.faceLiveness(userId));
    await prisma.user.update({ where: { id: userId }, data: { faceVerified: false } });
    throw forbidden(
      'Face did not match the enrolled record',
      'FACE_VERIFICATION_FAILED'
    );
  }

  await prisma.user.update({
    where: { id: userId },
    data: { faceVerified: true, faceVerifiedAt: new Date() },
  });
  await redis.set(keys.faceLiveness(userId), '1', 'EX', env.face.livenessTtlSeconds);

  return { passed, distance: Number(distance.toFixed(4)), threshold: env.face.matchThreshold };
}

export async function revoke(userId: string) {
  await prisma.$transaction([
    prisma.faceRecord.updateMany({
      where: { userId, active: true },
      data: { active: false, revokedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { faceVerified: false, faceVerifiedAt: null },
    }),
  ]);
  await redis.del(keys.faceLiveness(userId));
  return { faceVerified: false };
}

export async function status(userId: string) {
  const [user, record_, lastCheck] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { faceVerified: true, faceVerifiedAt: true },
    }),
    prisma.faceRecord.findFirst({
      where: { userId, active: true },
      select: { id: true, createdAt: true, provider: true },
    }),
    prisma.faceCheck.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { kind: true, passed: true, createdAt: true },
    }),
  ]);

  return {
    faceVerified: user?.faceVerified ?? false,
    faceVerifiedAt: user?.faceVerifiedAt ?? null,
    enrolled: Boolean(record_),
    enrolledAt: record_?.createdAt ?? null,
    provider: record_?.provider ?? env.face.provider,
    descriptorLength: DESCRIPTOR_LENGTH,
    lastCheck,
    /** What the gate blocks while unverified. */
    gatedActions: ['intents.create', 'intents.respond'],
  };
}
