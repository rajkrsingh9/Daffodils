import { Prisma, VibeTag } from '@prisma/client';
import { prisma } from '../../config/db';
import { badRequest, conflict, forbidden, notFound } from '../../utils/errors';
import { formatDistance } from '../../utils/geo';
import { clean, cleanOptional } from '../../utils/sanitize';
import { responderScore } from '../../utils/scoring';
import { notify } from '../notifications/notifications.service';
import { broadcastIntent, broadcastReach } from './broadcast.service';

const creatorSelect = {
  id: true,
  name: true,
  username: true,
  avatarUrl: true,
  bio: true,
  city: true,
  trustTier: true,
  trustScore: true,
  activitiesDone: true,
  companionsMet: true,
  interestTags: true,
} as const;

export interface CreateIntentInput {
  title: string;
  description?: string | null;
  activityEmoji?: string;
  locationName: string;
  lat: number;
  lng: number;
  scheduledAt: string;
  groupSize: number;
  vibeTag: VibeTag;
  radiusKm: number;
  expiresAt: string;
  /** Set when publishing straight from a Wishlist post. */
  fromPostId?: string;
}

export async function createIntent(creatorId: string, input: CreateIntentInput) {
  const scheduledAt = new Date(input.scheduledAt);
  const expiresAt = new Date(input.expiresAt);
  const now = new Date();

  if (Number.isNaN(scheduledAt.getTime())) throw badRequest('Invalid scheduled time');
  if (Number.isNaN(expiresAt.getTime())) throw badRequest('Invalid expiry time');
  if (expiresAt <= now) throw badRequest('Expiry must be in the future');
  if (scheduledAt < new Date(now.getTime() - 60 * 60 * 1000)) {
    throw badRequest('Scheduled time is in the past');
  }
  if (expiresAt > scheduledAt) {
    throw badRequest('An intent cannot stay open past the activity start time');
  }

  // One live intent at a time keeps the map honest and stops broadcast spam.
  const existing = await prisma.intent.findFirst({
    where: { creatorId, status: 'ACTIVE', expiresAt: { gt: now } },
    select: { id: true },
  });
  if (existing) {
    throw conflict(
      'You already have a live intent. Cancel it before posting another.',
      'INTENT_ALREADY_ACTIVE'
    );
  }

  const creator = await prisma.user.findUniqueOrThrow({
    where: { id: creatorId },
    select: { name: true },
  });

  const intent = await prisma.intent.create({
    data: {
      creatorId,
      title: clean(input.title),
      description: cleanOptional(input.description),
      activityEmoji: input.activityEmoji ?? '✨',
      locationName: clean(input.locationName),
      lat: input.lat,
      lng: input.lng,
      scheduledAt,
      groupSize: input.groupSize,
      vibeTag: input.vibeTag,
      radiusKm: input.radiusKm,
      expiresAt,
    },
    include: { creator: { select: creatorSelect } },
  });

  if (input.fromPostId) {
    await prisma.post.updateMany({
      where: { id: input.fromPostId, authorId: creatorId, type: 'WISHLIST' },
      data: { convertedIntentId: intent.id },
    });
  }

  const broadcast = await broadcastIntent({
    id: intent.id,
    creatorId,
    creatorName: creator.name,
    title: intent.title,
    locationName: intent.locationName,
    scheduledAt: intent.scheduledAt,
    lat: intent.lat,
    lng: intent.lng,
    radiusKm: intent.radiusKm,
    activityEmoji: intent.activityEmoji,
  });

  return { ...intent, broadcast };
}

/**
 * Intents visible to a user: active, unexpired, and inside the *intent's own*
 * broadcast radius — the maker chose who could see it, so a wide map viewport
 * must not leak an intent that was meant for a 1 km circle.
 */
export async function nearbyIntents(
  viewerId: string,
  params: { lat: number; lng: number; radiusKm: number; vibeTag?: VibeTag; limit: number }
) {
  const viewportMeters = params.radiusKm * 1000;

  const rows = await prisma.$queryRaw<
    {
      id: string;
      distanceM: number;
      responded: boolean;
    }[]
  >(Prisma.sql`
    SELECT
      i.id,
      ST_Distance(i.geom, ST_SetSRID(ST_MakePoint(${params.lng}, ${params.lat}), 4326)::geography) AS "distanceM",
      EXISTS (
        SELECT 1 FROM "intent_responses" r
        WHERE r."intentId" = i.id AND r."responderId" = ${viewerId}::uuid
      ) AS responded
    FROM "intents" i
    WHERE i.status = 'ACTIVE'
      AND i."expiresAt" > (NOW() AT TIME ZONE 'UTC')
      AND i."creatorId" <> ${viewerId}::uuid
      AND i.geom IS NOT NULL
      AND ST_DWithin(i.geom, ST_SetSRID(ST_MakePoint(${params.lng}, ${params.lat}), 4326)::geography, ${viewportMeters})
      AND ST_DWithin(i.geom, ST_SetSRID(ST_MakePoint(${params.lng}, ${params.lat}), 4326)::geography, i."radiusKm" * 1000)
      ${params.vibeTag ? Prisma.sql`AND i."vibeTag" = ${params.vibeTag}::"VibeTag"` : Prisma.empty}
      AND i."creatorId" NOT IN (SELECT "blockedId" FROM "blocks" WHERE "blockerId" = ${viewerId}::uuid)
      AND i."creatorId" NOT IN (SELECT "blockerId" FROM "blocks" WHERE "blockedId" = ${viewerId}::uuid)
    ORDER BY "distanceM" ASC
    LIMIT ${params.limit}
  `);

  if (!rows.length) return [];

  const intents = await prisma.intent.findMany({
    where: { id: { in: rows.map((r) => r.id) } },
    include: {
      creator: { select: creatorSelect },
      _count: { select: { responses: true } },
    },
  });

  const meta = new Map(rows.map((r) => [r.id, r]));

  return intents
    .map((intent) => {
      const row = meta.get(intent.id)!;
      return {
        ...intent,
        distanceM: Math.round(row.distanceM),
        distanceLabel: formatDistance(row.distanceM),
        slotsRemaining: Math.max(intent.groupSize - intent.filledSlots, 0),
        responseCount: intent._count.responses,
        hasResponded: row.responded,
      };
    })
    .sort((a, b) => a.distanceM - b.distanceM);
}

export async function getIntent(intentId: string, viewerId: string) {
  const intent = await prisma.intent.findUnique({
    where: { id: intentId },
    include: {
      creator: { select: creatorSelect },
      _count: { select: { responses: true } },
    },
  });
  if (!intent) throw notFound('Intent not found');

  const blocked = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: viewerId, blockedId: intent.creatorId },
        { blockerId: intent.creatorId, blockedId: viewerId },
      ],
    },
  });
  if (blocked) throw notFound('Intent not found');

  const [viewer, myResponse, recentPosts] = await Promise.all([
    prisma.user.findUnique({
      where: { id: viewerId },
      select: { lat: true, lng: true, interestTags: true },
    }),
    prisma.intentResponse.findUnique({
      where: { intentId_responderId: { intentId, responderId: viewerId } },
      select: { id: true, status: true, createdAt: true },
    }),
    // Intent detail shows the creator's last 3 posts (spec §6).
    prisma.post.findMany({
      where: { authorId: intent.creatorId, status: 'PUBLISHED' },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: {
        id: true,
        type: true,
        caption: true,
        mediaUrls: true,
        likeCount: true,
        commentCount: true,
        createdAt: true,
      },
    }),
  ]);

  let distanceM: number | null = null;
  if (viewer?.lat != null && viewer.lng != null) {
    const [{ d }] = await prisma.$queryRaw<{ d: number }[]>(Prisma.sql`
      SELECT ST_Distance(
        ST_SetSRID(ST_MakePoint(${intent.lng}, ${intent.lat}), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${viewer.lng}, ${viewer.lat}), 4326)::geography
      ) AS d
    `);
    distanceM = Math.round(d);
  }

  const sharedInterests = (viewer?.interestTags ?? []).filter((t) =>
    intent.creator.interestTags.includes(t)
  );

  return {
    ...intent,
    distanceM,
    distanceLabel: formatDistance(distanceM),
    slotsRemaining: Math.max(intent.groupSize - intent.filledSlots, 0),
    responseCount: intent._count.responses,
    myResponse,
    creatorRecentPosts: recentPosts,
    sharedInterests,
    isMine: intent.creatorId === viewerId,
  };
}

export async function myIntents(userId: string) {
  const intents = await prisma.intent.findMany({
    where: { creatorId: userId },
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: {
      _count: { select: { responses: true } },
      matches: {
        select: {
          id: true,
          status: true,
          companion: { select: { id: true, name: true, username: true, avatarUrl: true } },
        },
      },
    },
  });

  return Promise.all(
    intents.map(async (i) => ({
      ...i,
      responseCount: i._count.responses,
      slotsRemaining: Math.max(i.groupSize - i.filledSlots, 0),
      reach: i.status === 'ACTIVE' ? await broadcastReach(i.id) : i.broadcastCount,
    }))
  );
}

export async function cancelIntent(intentId: string, userId: string) {
  const intent = await prisma.intent.findUnique({ where: { id: intentId } });
  if (!intent) throw notFound('Intent not found');
  if (intent.creatorId !== userId) throw forbidden('This is not your intent');
  if (intent.status !== 'ACTIVE') {
    throw badRequest(`Intent is already ${intent.status.toLowerCase()}`);
  }

  const [updated, responders] = await prisma.$transaction([
    prisma.intent.update({
      where: { id: intentId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    }),
    prisma.intentResponse.findMany({
      where: { intentId, status: { in: ['YES', 'SELECTED'] } },
      select: { responderId: true },
    }),
  ]);

  await Promise.all(
    responders.map((r) =>
      notify({
        userId: r.responderId,
        type: 'SYSTEM',
        title: 'Plan called off',
        body: `"${intent.title}" was cancelled by the organiser.`,
        data: { intentId },
      })
    )
  );

  return updated;
}

/** Live responder list for the maker dashboard (workflow SVG, dashboard lane). */
export async function listResponses(intentId: string, userId: string) {
  const intent = await prisma.intent.findUnique({
    where: { id: intentId },
    select: { creatorId: true, title: true, status: true, lat: true, lng: true },
  });
  if (!intent) throw notFound('Intent not found');
  if (intent.creatorId !== userId) {
    throw forbidden('Only the intent maker can see responders');
  }

  const maker = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { interestTags: true },
  });

  const responses = await prisma.intentResponse.findMany({
    where: { intentId, status: { notIn: ['WITHDRAWN'] } },
    orderBy: { createdAt: 'asc' },
    include: {
      responder: {
        select: {
          ...creatorSelect,
          faceVerified: true,
          _count: { select: { ratingsReceived: true } },
        },
      },
    },
  });

  return responses
    .map((r) => {
      const sharedInterests = maker.interestTags.filter((t) =>
        r.responder.interestTags.includes(t)
      );
      return {
        id: r.id,
        status: r.status,
        message: r.message,
        createdAt: r.createdAt,
        selectedAt: r.selectedAt,
        distanceM: r.distanceM ? Math.round(r.distanceM) : null,
        distanceLabel: formatDistance(r.distanceM),
        sharedInterests,
        reviewCount: r.responder._count.ratingsReceived,
        responder: r.responder,
        _rank: responderScore({
          distanceM: r.distanceM,
          trustScore: Number(r.responder.trustScore),
          activitiesDone: r.responder.activitiesDone,
          sharedInterests: sharedInterests.length,
        }),
      };
    })
    .sort((a, b) => {
      // Someone already selected always pins to the top of the dashboard.
      if (a.status === 'SELECTED' && b.status !== 'SELECTED') return -1;
      if (b.status === 'SELECTED' && a.status !== 'SELECTED') return 1;
      return b._rank - a._rank;
    });
}

/** Manual re-broadcast — widens reach when nobody has bitten yet. */
export async function rebroadcast(intentId: string, userId: string) {
  const intent = await prisma.intent.findUnique({
    where: { id: intentId },
    include: { creator: { select: { name: true } } },
  });
  if (!intent) throw notFound('Intent not found');
  if (intent.creatorId !== userId) throw forbidden('This is not your intent');
  if (intent.status !== 'ACTIVE') throw badRequest('Intent is no longer active');

  return broadcastIntent({
    id: intent.id,
    creatorId: intent.creatorId,
    creatorName: intent.creator.name,
    title: intent.title,
    locationName: intent.locationName,
    scheduledAt: intent.scheduledAt,
    lat: intent.lat,
    lng: intent.lng,
    radiusKm: intent.radiusKm,
    activityEmoji: intent.activityEmoji,
  });
}
