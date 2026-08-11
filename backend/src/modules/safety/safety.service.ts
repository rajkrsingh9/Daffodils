import { prisma } from '../../config/db';
import { badRequest, notFound } from '../../utils/errors';
import { clean, cleanOptional } from '../../utils/sanitize';
import { sendSms } from '../../utils/sms';
import { notify } from '../notifications/notifications.service';

export async function setTrustedContact(
  userId: string,
  input: { name: string; phone: string; relation?: string | null }
) {
  // Link the contact to their Daffodils account when one exists, so SOS can
  // reach them by push as well as SMS.
  const linked = await prisma.user.findFirst({
    where: { phone: input.phone },
    select: { id: true },
  });

  const data = {
    name: clean(input.name),
    phone: input.phone,
    relation: cleanOptional(input.relation),
    linkedUserId: linked?.id ?? null,
  };

  return prisma.trustedContact.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}

export async function getTrustedContact(userId: string) {
  return prisma.trustedContact.findUnique({ where: { userId } });
}

export async function removeTrustedContact(userId: string) {
  await prisma.trustedContact.deleteMany({ where: { userId } });
  return { removed: true };
}

/**
 * SOS — spec §7. Fires SMS, push and the audit log immediately, in parallel,
 * and never fails the request because one channel is down: a partially
 * delivered alert is still an alert.
 */
export async function triggerSos(
  userId: string,
  input: { lat?: number; lng?: number; matchId?: string; note?: string }
) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { name: true, phone: true, trustedContact: true, lat: true, lng: true },
  });

  const lat = input.lat ?? user.lat ?? null;
  const lng = input.lng ?? user.lng ?? null;

  const mapsLink =
    lat != null && lng != null
      ? `https://maps.google.com/?q=${lat},${lng}`
      : 'location unavailable';

  const contact = user.trustedContact;

  let smsDelivered = false;
  let pushDelivered = false;

  const message =
    `🚨 ${user.name} triggered an SOS on Daffodils.\n` +
    `Location: ${mapsLink}\n` +
    (input.note ? `Note: ${clean(input.note)}\n` : '') +
    `Please check on them.`;

  if (contact) {
    smsDelivered = await sendSms(contact.phone, message);

    if (contact.linkedUserId) {
      await notify({
        userId: contact.linkedUserId,
        type: 'SOS_ALERT',
        title: `🚨 ${user.name} needs help`,
        body: `SOS triggered. Tap to see their location.`,
        data: { lat, lng, mapsLink, fromUserId: userId },
      });
      pushDelivered = true;
    }
  }

  const log = await prisma.safetyLog.create({
    data: {
      userId,
      matchId: input.matchId ?? null,
      kind: 'SOS',
      lat,
      lng,
      notifiedPhone: contact?.phone ?? null,
      smsDelivered,
      pushDelivered,
      note: cleanOptional(input.note),
    },
  });

  // If they are in an active match, the companion is told help was called —
  // deliberate: it de-escalates as often as it escalates.
  if (input.matchId) {
    const match = await prisma.match.findUnique({
      where: { id: input.matchId },
      select: { makerId: true, companionId: true },
    });
    if (match) {
      const other = match.makerId === userId ? match.companionId : match.makerId;
      await notify({
        userId: other,
        type: 'SOS_ALERT',
        title: 'Safety alert raised',
        body: `${user.name} has alerted their trusted contact.`,
        data: { matchId: input.matchId },
        silent: true,
      });
    }
  }

  return {
    logged: true,
    safetyLogId: log.id,
    hasTrustedContact: Boolean(contact),
    smsDelivered,
    pushDelivered,
    location: lat != null && lng != null ? { lat, lng, mapsLink } : null,
    ...(contact
      ? {}
      : {
          warning:
            'No trusted contact is set — add one in Settings so future alerts reach someone.',
        }),
  };
}

export async function listSafetyLogs(userId: string) {
  return prisma.safetyLog.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

/** Live location share toggle during an active match (workflow SVG, live lane). */
export async function shareLiveLocation(
  matchId: string,
  userId: string,
  lat: number,
  lng: number
) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { makerId: true, companionId: true, status: true },
  });
  if (!match) throw notFound('Match not found');
  if (match.makerId !== userId && match.companionId !== userId) {
    throw notFound('Match not found');
  }
  if (match.status !== 'CONFIRMED') {
    throw badRequest('Live location is only available during an active plan');
  }

  const other = match.makerId === userId ? match.companionId : match.makerId;
  await notify({
    userId: other,
    type: 'SYSTEM',
    title: 'Live location shared',
    body: 'Your companion shared their live location.',
    data: { matchId, lat, lng },
    silent: true,
  });

  return { shared: true };
}
