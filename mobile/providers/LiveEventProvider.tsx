import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { NearbyIntentQueue } from '../components/intent/NearbyIntentPopup';
import { ToastStack } from '../components/shared/ToastStack';
import { connectSocket, getSocket } from '../services/socket';
import { useAuthStore } from '../stores/authStore';
import { isViewingChatRoom, useLiveEventStore, type NearbyIntentPayload } from '../stores/liveEventStore';

/**
 * One socket subscription for every "something just happened" event that
 * should surface no matter which screen the user is looking at:
 *
 *   intent:nearby    → the interactive popup card (NearbyIntentQueue)
 *   intent:response  → toast for the maker: someone raised a hand
 *   intent:selected  → toast for the responder: they were chosen
 *   intent:declined  → toast for the maker: pick someone else
 *   match:confirmed  → toast for both sides: it's a match
 *   chat:activity    → toast for a message in a room the user isn't viewing
 *
 * Mounted once at the root, alongside — not inside — whichever screen is on
 * top, the same way a real-time social app's system notifications work.
 */
export function LiveEventProvider() {
  const router = useRouter();
  const meId = useAuthStore((s) => s.user?.id);
  const enqueueNearby = useLiveEventStore((s) => s.enqueueNearby);
  const pushToast = useLiveEventStore((s) => s.pushToast);

  useEffect(() => {
    let detach: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const socket = (await connectSocket()) ?? getSocket();
      if (!socket || cancelled) return;

      const onNearby = (payload: NearbyIntentPayload) => {
        // Defensive — the broadcast query already excludes the creator.
        if (payload.creator.id === meId) return;
        enqueueNearby(payload);
      };

      const onResponse = (payload: {
        intentId: string;
        responder: { name: string; avatarUrl: string | null };
      }) => {
        pushToast({
          emoji: '🙌',
          title: `${payload.responder.name} is in!`,
          body: 'Tap to see who else raised a hand',
          tone: 'success',
          actionLabel: 'View',
          durationMs: 6500,
          onPress: () => router.push(`/intent/dashboard/${payload.intentId}` as never),
        });
      };

      const onSelected = (payload: { intentId: string }) => {
        pushToast({
          emoji: '🤝',
          title: "You've been chosen!",
          body: 'Confirm to lock in the plan and open the chat',
          tone: 'success',
          actionLabel: 'Confirm',
          durationMs: 9000,
          onPress: () => router.push(`/intent/${payload.intentId}` as never),
        });
      };

      const onDeclined = (payload: { intentId: string }) => {
        pushToast({
          emoji: '🔁',
          title: 'They passed',
          body: 'Choose someone else from your responders',
          tone: 'warning',
          actionLabel: 'Open',
          onPress: () => router.push(`/intent/dashboard/${payload.intentId}` as never),
        });
      };

      const onMatchConfirmed = (payload: { matchId: string }) => {
        pushToast({
          emoji: '🌼',
          title: "It's a match!",
          body: 'Say hello and lock in the plan',
          tone: 'success',
          actionLabel: 'Open',
          onPress: () => router.push(`/match/${payload.matchId}` as never),
        });
      };

      const onChatActivity = (payload: {
        roomId: string;
        senderName: string;
        preview: string;
      }) => {
        // Already inside that exact conversation — the message is arriving
        // there live via message:new, a toast on top would just be noise.
        if (isViewingChatRoom(payload.roomId)) return;
        pushToast({
          emoji: '💬',
          title: payload.senderName,
          body: payload.preview,
          actionLabel: 'Open',
          onPress: () => router.push(`/chat/${payload.roomId}` as never),
        });
      };

      socket.on('intent:nearby', onNearby);
      socket.on('intent:response', onResponse);
      socket.on('intent:selected', onSelected);
      socket.on('intent:declined', onDeclined);
      socket.on('match:confirmed', onMatchConfirmed);
      socket.on('chat:activity', onChatActivity);

      detach = () => {
        socket.off('intent:nearby', onNearby);
        socket.off('intent:response', onResponse);
        socket.off('intent:selected', onSelected);
        socket.off('intent:declined', onDeclined);
        socket.off('match:confirmed', onMatchConfirmed);
        socket.off('chat:activity', onChatActivity);
      };
    })();

    return () => {
      cancelled = true;
      detach?.();
    };
  }, [router, meId, enqueueNearby, pushToast]);

  return (
    <>
      <ToastStack />
      <NearbyIntentQueue />
    </>
  );
}

export default LiveEventProvider;
