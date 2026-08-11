import { prisma } from '../config/db';
import { env } from '../config/env';
import { keys, redis } from '../config/redis';

/**
 * Reconciles the Redis location cache with Postgres.
 *
 * Redis holds the hot copy with a 5-minute TTL (spec §8); this flushes any
 * entry the API wrote but whose row update lost a race, and drops users from
 * the active set once their TTL has lapsed so broadcasts stop targeting them.
 */
export async function syncLocations() {
  const staleBefore = Date.now() - env.limits.locationTtlSeconds * 1000;
  const dropped = await redis.zremrangebyscore(keys.activeUsers, '-inf', staleBefore);

  const activeIds = await redis.zrange(keys.activeUsers, 0, -1);
  if (!activeIds.length) return { synced: 0, dropped };

  let synced = 0;
  for (const userId of activeIds) {
    const raw = await redis.get(keys.userLocation(userId));
    if (!raw) continue;

    const { lat, lng } = JSON.parse(raw) as { lat: number; lng: number };
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { lat: true, lng: true },
    });
    if (!user) continue;

    // ~11 m at the equator — below that the write is not worth the round trip.
    const drifted =
      user.lat == null ||
      user.lng == null ||
      Math.abs(user.lat - lat) > 0.0001 ||
      Math.abs(user.lng - lng) > 0.0001;

    if (drifted) {
      await prisma.user.update({
        where: { id: userId },
        data: { lat, lng, locationAt: new Date() },
      });
      synced++;
    }
  }

  if (synced || dropped) {
    console.log(`[cron] locations synced=${synced} dropped=${dropped}`);
  }
  return { synced, dropped };
}
