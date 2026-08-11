import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Resolves the API host.
 *
 * A physical device cannot reach the dev machine on localhost, so in
 * development we reuse the host Metro is already being served from — the one
 * address we know the device can route to.
 */
function resolveApiBase(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit;

  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants.manifest2 as { extra?: { expoGo?: { debuggerHost?: string } } })?.extra?.expoGo
      ?.debuggerHost;

  if (hostUri) {
    const host = hostUri.split(':')[0];
    return `http://${host}:4000`;
  }

  // Android emulator maps the host machine to 10.0.2.2.
  return Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';
}

export const API_BASE = resolveApiBase();
export const API_URL = `${API_BASE}/api/v1`;
export const SOCKET_URL = API_BASE;

export const config = {
  apiBase: API_BASE,
  apiUrl: API_URL,
  socketUrl: SOCKET_URL,

  /** Matches the server's DESCRIPTOR_LENGTH. */
  faceDescriptorLength: 128,

  postCaptionLimit: 280,
  reviewLimit: 140,
  maxPostImages: 4,
  minInterestTags: 3,

  defaultRadiusKm: 5,
  minRadiusKm: 1,
  maxRadiusKm: 20,
  feedRadiusKm: 50,

  locationUpdateIntervalMs: 60_000,
} as const;

export const INTEREST_OPTIONS = [
  'coffee', 'walks', 'music', 'books', 'football', 'cricket', 'movies',
  'street food', 'photography', 'art', 'gym', 'yoga', 'running', 'cycling',
  'board games', 'live gigs', 'museums', 'markets', 'temples', 'hiking',
  'dancing', 'chess', 'podcasts', 'baking', 'thrifting', 'birdwatching',
] as const;

export const ACTIVITY_EMOJIS = [
  '☕️', '🍽', '🚶', '🎬', '🎵', '📚', '⚽️', '🏸', '🎨', '🛍',
  '🏃', '🚴', '🧘', '🎲', '🌇', '🏛', '🎤', '🍺', '🧗', '✨',
] as const;
