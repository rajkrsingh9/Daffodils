import cron from 'node-cron';
import { expireIntents } from './expireIntents.job';
import { expireChatRooms, purgeOldMessages } from './expireChatRooms.job';
import { syncLocations } from './syncLocations.job';

const guard = (name: string, fn: () => Promise<unknown>) => () => {
  fn().catch((err) => console.error(`[cron:${name}] failed:`, err));
};

export function startJobs() {
  // Intent expiry — every minute (spec §7 lifecycle).
  cron.schedule('* * * * *', guard('expireIntents', expireIntents));

  // Chat room expiry — every 10 minutes (spec §7).
  cron.schedule('*/10 * * * *', guard('expireChatRooms', expireChatRooms));

  // Location reconciliation — every 5 minutes, matching the Redis TTL.
  cron.schedule('*/5 * * * *', guard('syncLocations', syncLocations));

  // Message retention sweep — nightly at 03:30.
  cron.schedule('30 3 * * *', guard('purgeOldMessages', purgeOldMessages));

  console.log('✓ cron jobs scheduled');
}
