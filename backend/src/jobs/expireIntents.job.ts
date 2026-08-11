import { prisma } from '../config/db';
import { notify } from '../modules/notifications/notifications.service';

/**
 * ACTIVE → EXPIRED once expires_at passes with no match (spec §7).
 * Runs every minute: an intent that lingers on the map after its window is a
 * worse failure than one that closes a few seconds early.
 */
export async function expireIntents() {
  const now = new Date();

  const stale = await prisma.intent.findMany({
    where: { status: 'ACTIVE', expiresAt: { lte: now } },
    select: { id: true, creatorId: true, title: true, _count: { select: { responses: true } } },
  });

  if (!stale.length) return { expired: 0 };

  await prisma.intent.updateMany({
    where: { id: { in: stale.map((i) => i.id) } },
    data: { status: 'EXPIRED' },
  });

  // Also close out everyone still waiting on a decision.
  await prisma.intentResponse.updateMany({
    where: { intentId: { in: stale.map((i) => i.id) }, status: { in: ['YES', 'SELECTED'] } },
    data: { status: 'PASSED_OVER', resolvedAt: now },
  });

  for (const intent of stale) {
    await notify({
      userId: intent.creatorId,
      type: 'SYSTEM',
      title: 'Your intent expired',
      body: intent._count.responses
        ? `"${intent.title}" closed with ${intent._count.responses} response(s) and no match.`
        : `"${intent.title}" closed without any responses. Try a wider radius next time.`,
      data: { intentId: intent.id },
      silent: true,
    });
  }

  console.log(`[cron] expired ${stale.length} intent(s)`);
  return { expired: stale.length };
}
