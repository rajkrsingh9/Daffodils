import { prisma } from '../config/db';
import { env } from '../config/env';
import { emitToRoom } from '../config/realtime';

/**
 * Spec §7 — rooms past expiry are closed every 10 minutes and accept no new
 * messages; history stays readable behind a "conversation has closed" banner.
 */
export async function expireChatRooms() {
  const now = new Date();

  const expiring = await prisma.chatRoom.findMany({
    where: { status: 'OPEN', expiresAt: { lte: now } },
    select: { id: true },
  });

  if (expiring.length) {
    await prisma.chatRoom.updateMany({
      where: { id: { in: expiring.map((r) => r.id) } },
      data: { status: 'CLOSED', closedAt: now },
    });

    for (const room of expiring) {
      emitToRoom(room.id, 'room:closed', { roomId: room.id });
    }
    console.log(`[cron] closed ${expiring.length} chat room(s)`);
  }

  return { closed: expiring.length };
}

/** Message history is retained for 30 days then purged (spec §7). */
export async function purgeOldMessages() {
  const cutoff = new Date(
    Date.now() - env.limits.messageRetentionDays * 24 * 60 * 60 * 1000
  );

  const { count } = await prisma.message.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  if (count) console.log(`[cron] purged ${count} message(s) older than 30 days`);
  return { purged: count };
}
