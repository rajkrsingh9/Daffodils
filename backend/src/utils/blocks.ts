import { Prisma } from '@prisma/client';

/**
 * Spec §7 — blocked users are excluded at the *query* level, in both
 * directions, so a blocked account can never surface in a feed or broadcast
 * even if a caller forgets to filter afterwards.
 *
 * Interpolated with Prisma.sql so the viewer id stays a bound parameter.
 */
export function notBlockedSql(column: Prisma.Sql, viewerId: string): Prisma.Sql {
  return Prisma.sql`
    ${column} NOT IN (SELECT "blockedId" FROM "blocks" WHERE "blockerId" = ${viewerId}::uuid)
    AND ${column} NOT IN (SELECT "blockerId" FROM "blocks" WHERE "blockedId" = ${viewerId}::uuid)
  `;
}
