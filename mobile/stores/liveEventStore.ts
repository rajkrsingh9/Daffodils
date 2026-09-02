import { create } from 'zustand';
import type { VibeKey } from '../constants/theme';

/**
 * Full-card data for the "someone posted nearby" popup — the entire shape
 * the socket hands over in one shot (see broadcastIntent on the server), so
 * the popup never needs a follow-up GET before it can render a face, a trust
 * badge, and a countdown.
 */
export interface NearbyIntentPayload {
  intentId: string;
  title: string;
  description: string | null;
  activityEmoji: string;
  locationName: string;
  lat: number;
  lng: number;
  scheduledAt: string;
  expiresAt: string;
  vibeTag: VibeKey;
  groupSize: number;
  radiusKm: number;
  distanceM: number;
  distanceLabel: string | null;
  requiresFaceVerification: boolean;
  creator: {
    id: string;
    name: string;
    username: string;
    avatarUrl: string | null;
    trustTier: 'TIER_1' | 'TIER_2' | 'TIER_3';
    trustScore: number;
    companionsMet: number;
    interestTags: string[];
    faceVerified: boolean;
    createdAt: string;
  };
}

export interface ToastItem {
  id: string;
  emoji: string;
  title: string;
  body?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
  actionLabel?: string;
  onPress?: () => void;
  durationMs?: number;
}

interface LiveEventState {
  nearbyQueue: NearbyIntentPayload[];
  toasts: ToastItem[];
  /** Chat room the user currently has open — suppresses its own toast. */
  activeChatRoomId: string | null;

  enqueueNearby: (payload: NearbyIntentPayload) => void;
  dismissNearby: (intentId: string) => void;

  pushToast: (toast: Omit<ToastItem, 'id'>) => void;
  dismissToast: (id: string) => void;

  setActiveChatRoom: (roomId: string | null) => void;
}

let toastSeq = 0;

export const useLiveEventStore = create<LiveEventState>((set, get) => ({
  nearbyQueue: [],
  toasts: [],
  activeChatRoomId: null,

  enqueueNearby: (payload) =>
    set((s) => {
      // A rebroadcast of the same intent shouldn't stack a second card.
      if (s.nearbyQueue.some((q) => q.intentId === payload.intentId)) return s;
      return { nearbyQueue: [...s.nearbyQueue, payload] };
    }),

  dismissNearby: (intentId) =>
    set((s) => ({ nearbyQueue: s.nearbyQueue.filter((q) => q.intentId !== intentId) })),

  pushToast: (toast) => {
    const id = `toast-${Date.now()}-${toastSeq++}`;
    set((s) => {
      // Never stack more than 3 deep — the oldest rolls off rather than the
      // screen filling with alerts during a burst of activity.
      const next = [...s.toasts, { ...toast, id }];
      return { toasts: next.length > 3 ? next.slice(next.length - 3) : next };
    });
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  setActiveChatRoom: (roomId) => set({ activeChatRoomId: roomId }),
}));

/** True while the current screen is that exact chat room. */
export function isViewingChatRoom(roomId: string): boolean {
  return useLiveEventStore.getState().activeChatRoomId === roomId;
}
