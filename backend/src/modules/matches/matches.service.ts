import { Prisma } from '@prisma/client';
import { prisma } from '../../config/db';
import { env } from '../../config/env';
import { badRequest, conflict, forbidden, notFound } from '../../utils/errors';
import { clean } from '../../utils/sanitize';
import { nextTrustScore } from '../../utils/scoring';
import { notify } from '../notifications/notifications.service';
import { emitToUser } from '../../config/realtime';

const partnerSelect = {
  id: true,
  name: true,
  username: true,
  avatarUrl: true,
  bio: true,
  city: true,
  trustTier: true,
  trustScore: true,
  activitiesDone: true,
  interestTags: true,
} as const;

/**
 * "I'm in →". Face verification is enforced by middleware before this runs
 * (spec §2), so reaching here means the responder is a verified human.
 */
export async function respond(
  intentId: string,
  responderId: string,
  message?: string | null
) {
  const intent = await prisma.intent.findUnique({
    where: { id: intentId },
    include: { creator: { select: { id: true, name: true } } },
  });
  if (!intent) throw notFound('Intent not found');
  if (intent.creatorId === responderId) {
    throw badRequest('You cannot respond to your own intent');
  }
  if (intent.status !== 'ACTIVE') throw badRequest('This intent is no longer open');
  if (intent.expiresAt <= new Date()) throw badRequest('This intent has expired');

  const blocked = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: responderId, blockedId: intent.creatorId },
        { blockerId: intent.creatorId, blockedId: responderId },
      ],
    },
  });
  if (blocked) throw notFound('Intent not found');

  const existing = await prisma.intentResponse.findUnique({
    where: { intentId_responderId: { intentId, responderId } },
  });
  if (existing && existing.status !== 'WITHDRAWN') {
    throw conflict('You have already responded to this intent');
  }

  // Distance at response time — shown on the maker's dashboard card.
  const responder = await prisma.user.findUniqueOrThrow({
    where: { id: responderId },
    select: { name: true, lat: true, lng: true, avatarUrl: true },
  });

  let distanceM: number | null = null;
  if (responder.lat != null && responder.lng != null) {
    const [{ d }] = await prisma.$queryRaw<{ d: number }[]>(Prisma.sql`
      SELECT ST_Distance(
        ST_SetSRID(ST_MakePoint(${intent.lng}, ${intent.lat}), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${responder.lng}, ${responder.lat}), 4326)::geography
      ) AS d
    `);
    distanceM = d;
  }

  const response = await prisma.intentResponse.upsert({
    where: { intentId_responderId: { intentId, responderId } },
    create: {
      intentId,
      responderId,
      message: message ? clean(message) : null,
      distanceM,
      status: 'YES',
    },
    update: {
      status: 'YES',
      message: message ? clean(message) : null,
      distanceM,
      resolvedAt: null,
    },
  });

  await notify({
    userId: intent.creatorId,
    type: 'INTENT_RESPONSE',
    title: `${responder.name} is in 🙌`,
    body: `They want to join "${intent.title}".`,
    data: { intentId, responseId: response.id },
  });

  // Live dashboard update for a maker who is already looking at the screen.
  emitToUser(intent.creatorId, 'intent:response', {
    intentId,
    responseId: response.id,
    responder: { id: responderId, name: responder.name, avatarUrl: responder.avatarUrl },
  });

  return response;
}

export async function withdraw(intentId: string, responderId: string) {
  const response = await prisma.intentResponse.findUnique({
    where: { intentId_responderId: { intentId, responderId } },
  });
  if (!response) throw notFound('You have not responded to this intent');
  if (response.status === 'CONFIRMED') {
    throw badRequest('You are already matched — cancel the match instead');
  }

  return prisma.intentResponse.update({
    where: { id: response.id },
    data: { status: 'WITHDRAWN', resolvedAt: new Date() },
  });
}

/** Maker taps "Choose →" on a responder card. */
export async function select(intentId: string, responseId: string, makerId: string) {
  const intent = await prisma.intent.findUnique({ where: { id: intentId } });
  if (!intent) throw notFound('Intent not found');
  if (intent.creatorId !== makerId) throw forbidden('This is not your intent');
  if (intent.status !== 'ACTIVE') throw badRequest('This intent is no longer active');

  const response = await prisma.intentResponse.findUnique({
    where: { id: responseId },
    include: { responder: { select: { id: true, name: true } } },
  });
  if (!response || response.intentId !== intentId) throw notFound('Response not found');
  if (response.status === 'WITHDRAWN') throw badRequest('That person has withdrawn');
  if (response.status === 'CONFIRMED') throw badRequest('Already matched with this person');

  // Only one outstanding selection at a time, so two people can't both be
  // waiting to accept the same slot.
  const pending = await prisma.intentResponse.findFirst({
    where: { intentId, status: 'SELECTED', NOT: { id: responseId } },
  });
  if (pending) {
    throw conflict(
      'You already have a pending selection. Wait for their answer or it will time out.',
      'SELECTION_PENDING'
    );
  }

  const updated = await prisma.intentResponse.update({
    where: { id: responseId },
    data: { status: 'SELECTED', selectedAt: new Date() },
  });

  const maker = await prisma.user.findUniqueOrThrow({
    where: { id: makerId },
    select: { name: true },
  });

  await notify({
    userId: response.responderId,
    type: 'SELECTION_REQUEST',
    title: `${maker.name} wants you as their companion`,
    body: `"${intent.title}" — accept?`,
    data: { intentId, responseId, requiresAction: true },
  });

  emitToUser(response.responderId, 'intent:selected', { intentId, responseId });

  return updated;
}

/** Responder accepts → the match, and its chat room, come into existence. */
export async function confirmSelection(responseId: string, responderId: string) {
  const response = await prisma.intentResponse.findUnique({
    where: { id: responseId },
    include: { intent: { include: { creator: { select: { id: true, name: true } } } } },
  });
  if (!response) throw notFound('Selection not found');
  if (response.responderId !== responderId) throw forbidden('This selection is not yours');
  if (response.status !== 'SELECTED') {
    throw badRequest('There is no pending selection to accept');
  }
  if (response.intent.status !== 'ACTIVE') {
    throw badRequest('This intent is no longer active');
  }

  const intent = response.intent;

  // Chat room lifetime — spec §7:
  //   scheduled_at + activity duration estimate + 2h buffer
  const expiresAt = new Date(
    intent.scheduledAt.getTime() +
      (env.limits.activityDurationHours + env.limits.chatBufferHours) * 3_600_000
  );

  const result = await prisma.$transaction(async (tx) => {
    const match = await tx.match.create({
      data: {
        intentId: intent.id,
        makerId: intent.creatorId,
        companionId: responderId,
        status: 'CONFIRMED',
        confirmedAt: new Date(),
      },
    });

    const chatRoom = await tx.chatRoom.create({
      data: { matchId: match.id, expiresAt },
    });

    await tx.message.create({
      data: {
        roomId: chatRoom.id,
        senderId: intent.creatorId,
        type: 'SYSTEM',
        body: `You matched for "${intent.title}" at ${intent.locationName}. This chat closes after the activity window.`,
      },
    });

    await tx.intentResponse.update({
      where: { id: responseId },
      data: { status: 'CONFIRMED', resolvedAt: new Date() },
    });

    const filled = intent.filledSlots + 1;
    const full = filled >= intent.groupSize;

    await tx.intent.update({
      where: { id: intent.id },
      data: { filledSlots: filled, ...(full ? { status: 'MATCHED' } : {}) },
    });

    // A full intent closes the door on everyone still waiting.
    if (full) {
      await tx.intentResponse.updateMany({
        where: { intentId: intent.id, status: 'YES' },
        data: { status: 'PASSED_OVER', resolvedAt: new Date() },
      });
    }

    await tx.user.updateMany({
      where: { id: { in: [intent.creatorId, responderId] } },
      data: { companionsMet: { increment: 1 } },
    });

    return { match, chatRoom, full };
  });

  const responder = await prisma.user.findUniqueOrThrow({
    where: { id: responderId },
    select: { name: true },
  });

  await Promise.all([
    notify({
      userId: intent.creatorId,
      type: 'MATCH_CONFIRMED',
      title: `It's a match! 🌼`,
      body: `${responder.name} accepted "${intent.title}".`,
      data: { matchId: result.match.id, intentId: intent.id },
    }),
    notify({
      userId: responderId,
      type: 'MATCH_CONFIRMED',
      title: `It's a match! 🌼`,
      body: `You're meeting ${intent.creator.name} for "${intent.title}".`,
      data: { matchId: result.match.id, intentId: intent.id },
    }),
  ]);

  for (const uid of [intent.creatorId, responderId]) {
    emitToUser(uid, 'match:confirmed', {
      matchId: result.match.id,
      intentId: intent.id,
    });
  }

  return getMatch(result.match.id, responderId);
}

export async function declineSelection(responseId: string, responderId: string) {
  const response = await prisma.intentResponse.findUnique({
    where: { id: responseId },
    include: { intent: { select: { id: true, creatorId: true, title: true } } },
  });
  if (!response) throw notFound('Selection not found');
  if (response.responderId !== responderId) throw forbidden('This selection is not yours');
  if (response.status !== 'SELECTED') throw badRequest('Nothing to decline');

  const updated = await prisma.intentResponse.update({
    where: { id: responseId },
    data: { status: 'DECLINED', resolvedAt: new Date() },
  });

  const responder = await prisma.user.findUniqueOrThrow({
    where: { id: responderId },
    select: { name: true },
  });

  // Maker goes back to the list and can choose someone else (workflow SVG).
  await notify({
    userId: response.intent.creatorId,
    type: 'MATCH_DECLINED',
    title: `${responder.name} can't make it`,
    body: `Pick another companion for "${response.intent.title}".`,
    data: { intentId: response.intent.id },
  });

  emitToUser(response.intent.creatorId, 'intent:declined', {
    intentId: response.intent.id,
    responseId,
  });

  return updated;
}

export async function getMatch(matchId: string, userId: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      intent: true,
      maker: { select: partnerSelect },
      companion: { select: partnerSelect },
      chatRoom: { select: { id: true, status: true, expiresAt: true } },
      ratings: { select: { raterId: true, score: true } },
    },
  });
  if (!match) throw notFound('Match not found');
  if (match.makerId !== userId && match.companionId !== userId) {
    throw forbidden('This match is not yours');
  }

  const isMaker = match.makerId === userId;

  return {
    ...match,
    partner: isMaker ? match.companion : match.maker,
    role: isMaker ? ('maker' as const) : ('companion' as const),
    hasRated: match.ratings.some((r) => r.raterId === userId),
    safetyTips: [
      'Meet in a public place with people around.',
      'Tell a trusted contact where you are going and when.',
      'Keep your own transport home — do not rely on your companion.',
      'Trust your instincts; leave any time you feel uneasy.',
      'Use the in-app SOS button if you ever feel unsafe.',
    ],
  };
}

export async function listMatches(userId: string) {
  const matches = await prisma.match.findMany({
    where: { OR: [{ makerId: userId }, { companionId: userId }] },
    orderBy: { createdAt: 'desc' },
    include: {
      intent: {
        select: {
          id: true,
          title: true,
          activityEmoji: true,
          locationName: true,
          scheduledAt: true,
        },
      },
      maker: { select: partnerSelect },
      companion: { select: partnerSelect },
      chatRoom: { select: { id: true, status: true, expiresAt: true } },
      ratings: { select: { raterId: true } },
    },
  });

  return matches.map((m) => ({
    ...m,
    partner: m.makerId === userId ? m.companion : m.maker,
    role: m.makerId === userId ? ('maker' as const) : ('companion' as const),
    hasRated: m.ratings.some((r) => r.raterId === userId),
  }));
}

/**
 * Marks the activity done. Both users get an *optional* Activity Log draft
 * (spec §6: "not forced") and a rating prompt.
 */
export async function completeMatch(matchId: string, userId: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      intent: true,
      maker: { select: { id: true, name: true } },
      companion: { select: { id: true, name: true } },
    },
  });
  if (!match) throw notFound('Match not found');
  if (match.makerId !== userId && match.companionId !== userId) {
    throw forbidden('This match is not yours');
  }
  if (match.status === 'COMPLETED') return { alreadyCompleted: true, matchId };
  if (match.status === 'CANCELLED') throw badRequest('This match was cancelled');

  const when = match.intent.scheduledAt.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });

  await prisma.$transaction(async (tx) => {
    await tx.match.update({
      where: { id: matchId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });

    await tx.intent.update({
      where: { id: match.intentId },
      data: { status: 'COMPLETED' },
    });

    // Close the chat room as soon as the activity is marked done.
    await tx.chatRoom.updateMany({
      where: { matchId },
      data: { status: 'CLOSED', closedAt: new Date() },
    });

    // Auto-generated Activity Log drafts — each user sees the other's name.
    await tx.post.createMany({
      data: [
        {
          authorId: match.makerId,
          type: 'ACTIVITY_LOG',
          status: 'DRAFT',
          caption: `${match.intent.activityEmoji} ${match.intent.title} with ${match.companion.name} · ${when}`,
          locationName: match.intent.locationName,
          lat: match.intent.lat,
          lng: match.intent.lng,
          sourceMatchId: matchId,
        },
        {
          authorId: match.companionId,
          type: 'ACTIVITY_LOG',
          status: 'DRAFT',
          caption: `${match.intent.activityEmoji} ${match.intent.title} with ${match.maker.name} · ${when}`,
          locationName: match.intent.locationName,
          lat: match.intent.lat,
          lng: match.intent.lng,
          sourceMatchId: matchId,
        },
      ],
    });
  });

  for (const uid of [match.makerId, match.companionId]) {
    await notify({
      userId: uid,
      type: 'RATING_REQUEST',
      title: 'How did it go?',
      body: `Rate your companion for "${match.intent.title}".`,
      data: { matchId, intentId: match.intentId },
    });
    await notify({
      userId: uid,
      type: 'ACTIVITY_LOG_DRAFT',
      title: 'Activity log ready',
      body: 'We drafted a post about it — edit and publish, or leave it.',
      data: { matchId },
      silent: true,
    });
    emitToUser(uid, 'match:completed', { matchId });
  }

  return { completed: true, matchId };
}

export async function cancelMatch(matchId: string, userId: string, reason?: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { intent: { select: { id: true, title: true, groupSize: true } } },
  });
  if (!match) throw notFound('Match not found');
  if (match.makerId !== userId && match.companionId !== userId) {
    throw forbidden('This match is not yours');
  }
  if (match.status === 'COMPLETED') throw badRequest('Already completed');

  await prisma.$transaction([
    prisma.match.update({
      where: { id: matchId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    }),
    prisma.chatRoom.updateMany({
      where: { matchId },
      data: { status: 'CLOSED', closedAt: new Date() },
    }),
    prisma.intent.update({
      where: { id: match.intentId },
      data: { filledSlots: { decrement: 1 }, status: 'ACTIVE' },
    }),
  ]);

  const other = match.makerId === userId ? match.companionId : match.makerId;
  const canceller = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { name: true },
  });

  await notify({
    userId: other,
    type: 'SYSTEM',
    title: 'Plan cancelled',
    body: `${canceller.name} cancelled "${match.intent.title}".${
      reason ? ` Reason: ${clean(reason)}` : ''
    }`,
    data: { matchId },
  });

  return { cancelled: true, matchId };
}

// ─────────────────────────────────────────────────────────────── rating ──

export async function rate(
  matchId: string,
  raterId: string,
  score: number,
  review?: string | null
) {
  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) throw notFound('Match not found');
  if (match.makerId !== raterId && match.companionId !== raterId) {
    throw forbidden('This match is not yours');
  }
  if (match.status !== 'COMPLETED') {
    throw badRequest('You can only rate a completed activity');
  }

  const rateeId = match.makerId === raterId ? match.companionId : match.makerId;

  const existing = await prisma.rating.findUnique({
    where: { matchId_raterId: { matchId, raterId } },
  });
  if (existing) throw conflict('You have already rated this activity');

  const ratee = await prisma.user.findUniqueOrThrow({
    where: { id: rateeId },
    select: { trustScore: true, activitiesDone: true, name: true },
  });

  // new_score = (current * done + new) / (done + 1), 2dp — spec §7.
  const updatedScore = nextTrustScore(
    Number(ratee.trustScore),
    ratee.activitiesDone,
    score
  );

  const [rating] = await prisma.$transaction([
    prisma.rating.create({
      data: {
        matchId,
        raterId,
        rateeId,
        score,
        review: review ? clean(review) : null,
      },
    }),
    prisma.user.update({
      where: { id: rateeId },
      data: {
        trustScore: updatedScore,
        activitiesDone: { increment: 1 },
      },
    }),
  ]);

  await notify({
    userId: rateeId,
    type: 'SYSTEM',
    title: 'You got a new review',
    body: `${score}★ from your last activity.`,
    data: { matchId },
    silent: true,
  });

  return { rating, newTrustScore: updatedScore };
}

/** Matches awaiting a rating — drives the post-activity rating prompt. */
export async function pendingRatings(userId: string) {
  return prisma.match.findMany({
    where: {
      status: 'COMPLETED',
      OR: [{ makerId: userId }, { companionId: userId }],
      ratings: { none: { raterId: userId } },
    },
    include: {
      intent: { select: { title: true, activityEmoji: true, scheduledAt: true } },
      maker: { select: partnerSelect },
      companion: { select: partnerSelect },
    },
    orderBy: { completedAt: 'desc' },
  });
}
