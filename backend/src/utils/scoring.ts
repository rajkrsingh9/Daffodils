/**
 * Trust score — spec §7:
 *   new_score = (current_score * activities_done + new_rating) / (activities_done + 1)
 * Rounded to 2 decimal places.
 */
export function nextTrustScore(
  currentScore: number,
  activitiesDone: number,
  newRating: number
): number {
  const next = (currentScore * activitiesDone + newRating) / (activitiesDone + 1);
  return Math.round(next * 100) / 100;
}

/**
 * Feed ranking — spec / posts_profile_layer.svg:
 *   distance · recency · shared interests · mutual activity history.
 * Deliberately NOT popularity: like counts never enter the score, so the feed
 * cannot turn into a follower-count leaderboard.
 */
export interface FeedRankInput {
  distanceM: number | null;
  ageHours: number;
  sharedInterests: number;
  mutualActivities: number;
  hasActiveIntent: boolean;
}

export function feedScore(input: FeedRankInput): number {
  // Proximity: full marks inside 1 km, decaying to ~0 by 50 km.
  const km = (input.distanceM ?? 25_000) / 1000;
  const proximity = 1 / (1 + km / 5);

  // Recency: half-life of 12 hours.
  const recency = Math.pow(0.5, input.ageHours / 12);

  const interests = Math.min(input.sharedInterests, 5) / 5;
  const history = Math.min(input.mutualActivities, 3) / 3;
  const liveBonus = input.hasActiveIntent ? 0.12 : 0;

  return (
    proximity * 0.4 + recency * 0.3 + interests * 0.18 + history * 0.12 + liveBonus
  );
}

/**
 * Responder ranking on the maker dashboard: closest, most-trusted, most
 * overlapping first. Purely an ordering hint — the maker always chooses.
 */
export function responderScore(input: {
  distanceM: number | null;
  trustScore: number;
  activitiesDone: number;
  sharedInterests: number;
}): number {
  const km = (input.distanceM ?? 25_000) / 1000;
  const proximity = 1 / (1 + km / 3);
  const trust = Math.min(input.trustScore, 5) / 5;
  const experience = Math.min(input.activitiesDone, 10) / 10;
  const interests = Math.min(input.sharedInterests, 5) / 5;

  return proximity * 0.35 + trust * 0.3 + interests * 0.25 + experience * 0.1;
}
