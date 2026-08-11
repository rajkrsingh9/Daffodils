import { Prisma } from '@prisma/client';
import { prisma } from '../../config/db';
import { env } from '../../config/env';
import { keys, redis } from '../../config/redis';
import { badRequest, conflict, notFound } from '../../utils/errors';
import { formatDistance, haversineMeters } from '../../utils/geo';
import { clean, cleanOptional } from '../../utils/sanitize';
import { publicUserSelect } from '../auth/auth.service';

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      ...publicUserSelect,
      phone: true,
      email: true,
      lat: true,
      lng: true,
      locationAt: true,
      faceVerifiedAt: true,
      trustedContact: {
        select: { id: true, name: true, phone: true, relation: true },
      },
    },
  });
  if (!user) throw notFound('User not found');

  const postCount = await prisma.post.count({
    where: { authorId: userId, status: 'PUBLISHED' },
  });

  return { ...user, postCount };
}

interface UpdateProfileInput {
  name?: string;
  bio?: string | null;
  city?: string | null;
  avatarUrl?: string | null;
  interestTags?: string[];
  username?: string;
}

export async function updateMe(userId: string, input: UpdateProfileInput) {
  if (input.username) {
    const taken = await prisma.user.findFirst({
      where: { username: input.username.toLowerCase(), NOT: { id: userId } },
      select: { id: true },
    });
    if (taken) throw conflict('That username is taken');
  }

  return prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.name !== undefined ? { name: clean(input.name) } : {}),
      ...(input.bio !== undefined ? { bio: cleanOptional(input.bio) } : {}),
      ...(input.city !== undefined ? { city: cleanOptional(input.city) } : {}),
      ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
      ...(input.username ? { username: input.username.toLowerCase() } : {}),
      ...(input.interestTags
        ? { interestTags: input.interestTags.map((t) => clean(t).toLowerCase()).filter(Boolean) }
        : {}),
    },
    select: publicUserSelect,
  });
}

/**
 * Public profile — every profile is public (posts_profile_layer.svg), so this
 * is the same shape for self and others, minus private counters.
 */
export async function getProfile(username: string, viewerId: string) {
  const user = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
    select: { ...publicUserSelect, lat: true, lng: true },
  });
  if (!user || !user.id) throw notFound('Profile not found');

  const blocked = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: viewerId, blockedId: user.id },
        { blockerId: user.id, blockedId: viewerId },
      ],
    },
    select: { blockerId: true },
  });
  if (blocked) throw notFound('Profile not found');

  const [postCount, ratingCount, activeIntent, viewer, sharedActivities] =
    await Promise.all([
      prisma.post.count({ where: { authorId: user.id, status: 'PUBLISHED' } }),
      prisma.rating.count({ where: { rateeId: user.id } }),
      prisma.intent.findFirst({
        where: { creatorId: user.id, status: 'ACTIVE', expiresAt: { gt: new Date() } },
        select: { id: true, title: true, scheduledAt: true },
      }),
      prisma.user.findUnique({
        where: { id: viewerId },
        select: { lat: true, lng: true, interestTags: true },
      }),
      prisma.match.count({
        where: {
          status: 'COMPLETED',
          OR: [
            { makerId: viewerId, companionId: user.id },
            { makerId: user.id, companionId: viewerId },
          ],
        },
      }),
    ]);

  const distanceM =
    viewer?.lat != null && viewer.lng != null && user.lat != null && user.lng != null
      ? haversineMeters(viewer.lat, viewer.lng, user.lat, user.lng)
      : null;

  const sharedInterests = (viewer?.interestTags ?? []).filter((t) =>
    user.interestTags.includes(t)
  );

  const { lat: _lat, lng: _lng, ...publicFields } = user;

  return {
    ...publicFields,
    postCount,
    ratingCount,
    // "Intent live 🟢" badge source.
    activeIntent,
    distanceM: distanceM ? Math.round(distanceM) : null,
    distanceLabel: formatDistance(distanceM),
    sharedInterests,
    sharedActivities,
    isSelf: user.id === viewerId,
  };
}

/** Past matched intents — the profile "Activity" tab. */
export async function getActivity(username: string, viewerId: string) {
  const user = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
    select: { id: true },
  });
  if (!user) throw notFound('Profile not found');

  const isSelf = user.id === viewerId;

  const matches = await prisma.match.findMany({
    where: {
      OR: [{ makerId: user.id }, { companionId: user.id }],
      // Others only ever see completed activities; the owner sees everything.
      ...(isSelf ? {} : { status: 'COMPLETED' }),
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      status: true,
      completedAt: true,
      createdAt: true,
      intent: {
        select: {
          id: true,
          title: true,
          activityEmoji: true,
          locationName: true,
          scheduledAt: true,
          vibeTag: true,
          status: true,
        },
      },
      maker: { select: { id: true, name: true, username: true, avatarUrl: true } },
      companion: { select: { id: true, name: true, username: true, avatarUrl: true } },
    },
  });

  return matches.map((m) => ({
    ...m,
    partner: m.maker.id === user.id ? m.companion : m.maker,
  }));
}

/** Ratings received — the profile "Reviews" tab. */
export async function getReviews(username: string) {
  const user = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
    select: { id: true },
  });
  if (!user) throw notFound('Profile not found');

  return prisma.rating.findMany({
    where: { rateeId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      score: true,
      review: true,
      createdAt: true,
      rater: { select: { name: true, username: true, avatarUrl: true } },
      match: { select: { intent: { select: { title: true, activityEmoji: true } } } },
    },
  });
}

/**
 * Location update — Redis is the hot path (5 min TTL, spec §8); the row keeps
 * a durable copy so PostGIS radius queries still work for a user who has been
 * idle longer than the TTL.
 */
export async function updateLocation(userId: string, lat: number, lng: number) {
  await redis.set(
    keys.userLocation(userId),
    JSON.stringify({ lat, lng, at: Date.now() }),
    'EX',
    env.limits.locationTtlSeconds
  );
  await redis.zadd(keys.activeUsers, Date.now(), userId);

  // Trigger daffodils_sync_geom keeps `geom` aligned with lat/lng.
  await prisma.user.update({
    where: { id: userId },
    data: { lat, lng, locationAt: new Date(), lastActiveAt: new Date() },
  });

  return { lat, lng, ttlSeconds: env.limits.locationTtlSeconds };
}

export async function getCachedLocation(userId: string) {
  const raw = await redis.get(keys.userLocation(userId));
  return raw ? (JSON.parse(raw) as { lat: number; lng: number; at: number }) : null;
}

// ───────────────────────────────────────────────────── blocks & reports ──

export async function block(blockerId: string, blockedUsername: string) {
  const target = await prisma.user.findUnique({
    where: { username: blockedUsername.toLowerCase() },
    select: { id: true },
  });
  if (!target) throw notFound('User not found');
  if (target.id === blockerId) throw badRequest('You cannot block yourself');

  await prisma.block.upsert({
    where: { blockerId_blockedId: { blockerId, blockedId: target.id } },
    create: { blockerId, blockedId: target.id },
    update: {},
  });

  return { blocked: true, userId: target.id };
}

export async function unblock(blockerId: string, blockedUsername: string) {
  const target = await prisma.user.findUnique({
    where: { username: blockedUsername.toLowerCase() },
    select: { id: true },
  });
  if (!target) throw notFound('User not found');

  await prisma.block.deleteMany({ where: { blockerId, blockedId: target.id } });
  return { blocked: false, userId: target.id };
}

export async function listBlocked(userId: string) {
  const rows = await prisma.block.findMany({
    where: { blockerId: userId },
    select: {
      createdAt: true,
      blocked: { select: { id: true, name: true, username: true, avatarUrl: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r) => ({ ...r.blocked, blockedAt: r.createdAt }));
}

export async function report(
  reporterId: string,
  input: { username?: string; postId?: string; reason: string; details?: string }
) {
  let reportedUserId: string | null = null;
  if (input.username) {
    const target = await prisma.user.findUnique({
      where: { username: input.username.toLowerCase() },
      select: { id: true },
    });
    if (!target) throw notFound('User not found');
    reportedUserId = target.id;
  }

  if (!reportedUserId && !input.postId) {
    throw badRequest('Report a user or a post');
  }

  await prisma.report.create({
    data: {
      reporterId,
      reportedUserId,
      postId: input.postId ?? null,
      reason: clean(input.reason),
      details: cleanOptional(input.details),
    },
  });

  return { reported: true };
}

// ───────────────────────────────────────────────────────────── devices ──

export async function registerDevice(
  userId: string,
  expoPushToken: string,
  platform?: string
) {
  await prisma.device.upsert({
    where: { expoPushToken },
    create: { userId, expoPushToken, platform: platform ?? null },
    update: { userId, lastSeenAt: new Date() },
  });
  return { registered: true };
}

export async function unregisterDevice(userId: string, expoPushToken: string) {
  await prisma.device.deleteMany({ where: { userId, expoPushToken } });
  return { registered: false };
}

/** Username availability check for the onboarding form. */
export async function checkUsername(username: string) {
  const existing = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
    select: { id: true },
  });
  return { username: username.toLowerCase(), available: !existing };
}

/** People search — used by the trusted-contact picker and @-mentions. */
export async function search(query: string, viewerId: string, limit = 20) {
  const q = `%${query.toLowerCase()}%`;
  return prisma.$queryRaw<
    { id: string; name: string; username: string; avatarUrl: string | null }[]
  >(Prisma.sql`
    SELECT u.id, u.name, u.username, u."avatarUrl"
    FROM "users" u
    WHERE u."deletedAt" IS NULL
      AND u.id <> ${viewerId}::uuid
      AND (LOWER(u.username) LIKE ${q} OR LOWER(u.name) LIKE ${q})
      AND u.id NOT IN (SELECT "blockedId" FROM "blocks" WHERE "blockerId" = ${viewerId}::uuid)
      AND u.id NOT IN (SELECT "blockerId" FROM "blocks" WHERE "blockedId" = ${viewerId}::uuid)
    ORDER BY u."lastActiveAt" DESC
    LIMIT ${limit}
  `);
}
