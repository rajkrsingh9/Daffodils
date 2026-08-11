import { NotificationType } from '@prisma/client';
import { prisma } from '../../config/db';
import { sendPush } from '../../utils/pushNotification';
import { emitToUser } from '../../config/realtime';

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Skip the push and only persist + emit over the socket. */
  silent?: boolean;
}

/**
 * One fan-out point for every user-facing alert: it persists the row (so the
 * notifications screen has history), emits over Socket.IO for anyone with the
 * app open, and pushes to their registered devices.
 */
export async function notify(input: NotifyInput) {
  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      data: (input.data ?? {}) as object,
    },
  });

  emitToUser(input.userId, 'notification:new', notification);

  if (!input.silent) {
    const devices = await prisma.device.findMany({
      where: { userId: input.userId },
      select: { expoPushToken: true },
    });
    await sendPush(
      devices.map((d) => ({
        to: d.expoPushToken,
        title: input.title,
        body: input.body,
        data: { notificationId: notification.id, type: input.type, ...input.data },
      }))
    );
  }

  return notification;
}

/** Bulk variant for intent broadcasts — one query, one chunked push call. */
export async function notifyMany(inputs: NotifyInput[]) {
  if (!inputs.length) return 0;

  await prisma.notification.createMany({
    data: inputs.map((i) => ({
      userId: i.userId,
      type: i.type,
      title: i.title,
      body: i.body,
      data: (i.data ?? {}) as object,
    })),
  });

  for (const i of inputs) {
    emitToUser(i.userId, 'notification:new', {
      type: i.type,
      title: i.title,
      body: i.body,
      data: i.data,
      createdAt: new Date(),
    });
  }

  const devices = await prisma.device.findMany({
    where: { userId: { in: inputs.map((i) => i.userId) } },
    select: { userId: true, expoPushToken: true },
  });

  const byUser = new Map<string, string[]>();
  for (const d of devices) {
    byUser.set(d.userId, [...(byUser.get(d.userId) ?? []), d.expoPushToken]);
  }

  const messages = inputs.flatMap((i) =>
    (byUser.get(i.userId) ?? []).map((token) => ({
      to: token,
      title: i.title,
      body: i.body,
      data: { type: i.type, ...i.data },
    }))
  );

  return sendPush(messages);
}

export async function list(userId: string, cursor?: string, limit = 30) {
  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  return {
    items: hasMore ? rows.slice(0, limit) : rows,
    nextCursor: hasMore ? rows[limit - 1].id : null,
  };
}

export async function unreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function markRead(userId: string, ids?: string[]) {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null, ...(ids?.length ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  });
  return { updated: result.count };
}
