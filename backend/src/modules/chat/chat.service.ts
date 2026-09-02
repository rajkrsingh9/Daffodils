import { MessageType } from '@prisma/client';
import { prisma } from '../../config/db';
import { emitToRoom, emitToUser } from '../../config/realtime';
import { badRequest, forbidden, notFound } from '../../utils/errors';
import { clean } from '../../utils/sanitize';
import { isAllowedMediaUrl } from '../../utils/sanitize';
import { notify } from '../notifications/notifications.service';

const partnerSelect = {
  id: true,
  name: true,
  username: true,
  avatarUrl: true,
  trustTier: true,
} as const;

/** Chat list screen: every room the user is party to. */
export async function listRooms(userId: string) {
  const rooms = await prisma.chatRoom.findMany({
    where: { match: { OR: [{ makerId: userId }, { companionId: userId }] } },
    orderBy: { createdAt: 'desc' },
    include: {
      match: {
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
        },
      },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true, type: true, body: true, senderId: true, createdAt: true },
      },
    },
  });

  const unread = await prisma.message.groupBy({
    by: ['roomId'],
    where: {
      readAt: null,
      senderId: { not: userId },
      room: { match: { OR: [{ makerId: userId }, { companionId: userId }] } },
    },
    _count: { _all: true },
  });
  const unreadByRoom = new Map(unread.map((u) => [u.roomId, u._count._all]));

  return rooms.map((room) => ({
    id: room.id,
    status: room.status,
    expiresAt: room.expiresAt,
    expiresInMs: Math.max(room.expiresAt.getTime() - Date.now(), 0),
    matchId: room.matchId,
    intent: room.match.intent,
    partner: room.match.makerId === userId ? room.match.companion : room.match.maker,
    lastMessage: room.messages[0] ?? null,
    unreadCount: unreadByRoom.get(room.id) ?? 0,
  }));
}

async function loadRoomForUser(roomId: string, userId: string) {
  const room = await prisma.chatRoom.findUnique({
    where: { id: roomId },
    include: {
      match: {
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
        },
      },
    },
  });
  if (!room) throw notFound('Chat room not found');
  if (room.match.makerId !== userId && room.match.companionId !== userId) {
    throw forbidden('This conversation is not yours');
  }
  return room;
}

export async function getRoom(roomId: string, userId: string) {
  const room = await loadRoomForUser(roomId, userId);
  return {
    id: room.id,
    status: room.status,
    expiresAt: room.expiresAt,
    expiresInMs: Math.max(room.expiresAt.getTime() - Date.now(), 0),
    matchId: room.matchId,
    intent: room.match.intent,
    partner: room.match.makerId === userId ? room.match.companion : room.match.maker,
    // Expired rooms are read-only with a closing banner (spec §6).
    readOnly: room.status === 'CLOSED' || room.expiresAt <= new Date(),
  };
}

export async function listMessages(
  roomId: string,
  userId: string,
  cursor?: string,
  limit = 40
) {
  await loadRoomForUser(roomId, userId);

  const rows = await prisma.message.findMany({
    where: { roomId },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { sender: { select: partnerSelect } },
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  return {
    // Oldest-first for rendering; the cursor still walks backwards in time.
    items: items.reverse(),
    nextCursor: hasMore ? items[0].id : null,
  };
}

export interface SendMessageInput {
  type?: MessageType;
  body?: string | null;
  mediaUrl?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export async function sendMessage(
  roomId: string,
  senderId: string,
  input: SendMessageInput
) {
  const room = await loadRoomForUser(roomId, senderId);

  if (room.status === 'CLOSED' || room.expiresAt <= new Date()) {
    throw badRequest('This conversation has closed', 'ROOM_CLOSED');
  }

  const type = input.type ?? 'TEXT';
  if (type === 'SYSTEM') throw badRequest('Cannot send system messages');

  if (type === 'TEXT' && !input.body?.trim()) {
    throw badRequest('Message body is required');
  }
  if (type === 'IMAGE') {
    if (!input.mediaUrl) throw badRequest('mediaUrl is required for image messages');
    if (!isAllowedMediaUrl(input.mediaUrl)) {
      throw badRequest('Unsupported media type', 'INVALID_MEDIA');
    }
  }
  if (type === 'LOCATION' && (input.lat == null || input.lng == null)) {
    throw badRequest('lat and lng are required for a location ping');
  }

  const message = await prisma.message.create({
    data: {
      roomId,
      senderId,
      type,
      body: input.body ? clean(input.body) : null,
      mediaUrl: input.mediaUrl ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
    },
    include: { sender: { select: partnerSelect } },
  });

  emitToRoom(roomId, 'message:new', message);

  const recipientId =
    room.match.makerId === senderId ? room.match.companionId : room.match.makerId;

  const preview =
    type === 'TEXT'
      ? message.body!.slice(0, 80)
      : type === 'IMAGE'
        ? '📷 Photo'
        : '📍 Shared their location';

  // Nudges the recipient's user room (not the chat room itself) so a client
  // that has the app open but isn't inside this exact conversation can raise
  // an in-app toast with enough context to act on — who, what, where to go —
  // without an extra round trip back to the server.
  emitToUser(recipientId, 'chat:activity', {
    roomId,
    messageId: message.id,
    senderName: message.sender.name,
    senderAvatarUrl: message.sender.avatarUrl,
    preview,
  });

  await notify({
    userId: recipientId,
    type: 'CHAT_MESSAGE',
    title: message.sender.name,
    body: preview,
    data: { roomId, matchId: room.matchId },
  });

  return message;
}

export async function markRead(roomId: string, userId: string) {
  await loadRoomForUser(roomId, userId);
  const result = await prisma.message.updateMany({
    where: { roomId, senderId: { not: userId }, readAt: null },
    data: { readAt: new Date() },
  });
  if (result.count) emitToRoom(roomId, 'message:read', { roomId, readerId: userId });
  return { read: result.count };
}
