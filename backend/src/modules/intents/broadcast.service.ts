import { Prisma, TrustTier, VibeTag } from '@prisma/client';
import { prisma } from '../../config/db';
import { env } from '../../config/env';
import { keys, redis } from '../../config/redis';
import { formatDistance } from '../../utils/geo';
import { notifyMany } from '../notifications/notifications.service';
import { emitToUser } from '../../config/realtime';

export interface BroadcastTarget {
  id: string;
  name: string;
  distanceM: number;
  faceVerified: boolean;
}

export interface BroadcastCreator {
  id: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  trustTier: TrustTier;
  trustScore: Prisma.Decimal | number | string;
  companionsMet: number;
  interestTags: string[];
  faceVerified: boolean;
  createdAt: Date;
}

/**
 * The dispatch query — cab-hailing style. Finds every reachable user inside
 * the intent's broadcast radius using the GIST index on users.geom.
 *
 * Block exclusion is inlined here rather than filtered afterwards because
 * spec §7 requires it at the query level in both directions.
 */
export async function findTargets(intent: {
  id: string;
  creatorId: string;
  lat: number;
  lng: number;
  radiusKm: number;
}): Promise<BroadcastTarget[]> {
  const radiusMeters = intent.radiusKm * 1000;

  return prisma.$queryRaw<BroadcastTarget[]>(Prisma.sql`
    SELECT
      u.id,
      u.name,
      ST_Distance(
        u.geom,
        ST_SetSRID(ST_MakePoint(${intent.lng}, ${intent.lat}), 4326)::geography
      ) AS "distanceM",
      u."faceVerified"
    FROM "users" u
    WHERE u."deletedAt" IS NULL
      AND u."isActive" = TRUE
      AND u.id <> ${intent.creatorId}::uuid
      AND u.geom IS NOT NULL
      AND ST_DWithin(
        u.geom,
        ST_SetSRID(ST_MakePoint(${intent.lng}, ${intent.lat}), 4326)::geography,
        ${radiusMeters}
      )
      AND u."lastActiveAt" > (NOW() AT TIME ZONE 'UTC') - INTERVAL '7 days'
      AND u.id NOT IN (SELECT "blockedId" FROM "blocks" WHERE "blockerId" = ${intent.creatorId}::uuid)
      AND u.id NOT IN (SELECT "blockerId" FROM "blocks" WHERE "blockedId" = ${intent.creatorId}::uuid)
    ORDER BY "distanceM" ASC
    LIMIT 500
  `);
}

/**
 * Fan an intent out to everyone nearby. The notified set is kept in Redis for
 * 24h (spec §8) so a re-broadcast after an edit never double-notifies.
 */
export async function broadcastIntent(intent: {
  id: string;
  creatorId: string;
  creator: BroadcastCreator;
  title: string;
  description: string | null;
  locationName: string;
  scheduledAt: Date;
  expiresAt: Date;
  lat: number;
  lng: number;
  radiusKm: number;
  activityEmoji: string;
  vibeTag: VibeTag;
  groupSize: number;
}) {
  const targets = await findTargets(intent);
  if (!targets.length) return { notified: 0, reached: 0 };

  const setKey = keys.intentBroadcast(intent.id);
  const alreadyNotified = new Set(await redis.smembers(setKey));
  const fresh = targets.filter((t) => !alreadyNotified.has(t.id));

  if (!fresh.length) return { notified: 0, reached: targets.length };

  const when = intent.scheduledAt.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  await notifyMany(
    fresh.map((t) => ({
      userId: t.id,
      type: 'INTENT_BROADCAST' as const,
      title: `${intent.activityEmoji} ${intent.creator.name} wants company`,
      body: `${intent.title} near ${intent.locationName} at ${when} · ${formatDistance(
        t.distanceM
      )} away`,
      data: {
        intentId: intent.id,
        distanceM: Math.round(t.distanceM),
        // Non-verified users get the same alert but the app routes them to
        // face enrolment instead of the respond button.
        requiresFaceVerification: !t.faceVerified,
      },
    }))
  );

  // Anyone with the app open gets the full card pushed straight into the
  // "nearby intent" popup — every field it needs to render is in this one
  // payload, so the popup never has to round-trip a GET before showing a
  // face, a trust badge, or a countdown.
  for (const t of fresh) {
    emitToUser(t.id, 'intent:nearby', {
      intentId: intent.id,
      title: intent.title,
      description: intent.description,
      activityEmoji: intent.activityEmoji,
      locationName: intent.locationName,
      lat: intent.lat,
      lng: intent.lng,
      scheduledAt: intent.scheduledAt,
      expiresAt: intent.expiresAt,
      vibeTag: intent.vibeTag,
      groupSize: intent.groupSize,
      radiusKm: intent.radiusKm,
      distanceM: Math.round(t.distanceM),
      distanceLabel: formatDistance(t.distanceM),
      requiresFaceVerification: !t.faceVerified,
      creator: {
        id: intent.creator.id,
        name: intent.creator.name,
        username: intent.creator.username,
        avatarUrl: intent.creator.avatarUrl,
        trustTier: intent.creator.trustTier,
        trustScore: Number(intent.creator.trustScore),
        companionsMet: intent.creator.companionsMet,
        interestTags: intent.creator.interestTags,
        faceVerified: intent.creator.faceVerified,
        createdAt: intent.creator.createdAt,
      },
    });
  }

  await redis.sadd(setKey, ...fresh.map((t) => t.id));
  await redis.expire(setKey, env.limits.broadcastSetTtlSeconds);

  await prisma.intent.update({
    where: { id: intent.id },
    data: { broadcastCount: { increment: fresh.length } },
  });

  return { notified: fresh.length, reached: targets.length };
}

export async function broadcastReach(intentId: string) {
  return redis.scard(keys.intentBroadcast(intentId));
}
