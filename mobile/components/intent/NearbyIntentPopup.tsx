import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeOutDown, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import {
  Avatar,
  ClayButton,
  TrustBadge,
} from '../shared';
import {
  clayEdge,
  colors,
  radius,
  shadows,
  spacing,
  trustTier as trustTiers,
  type,
  vibe as vibes,
  vibeHero,
} from '../../constants/theme';
import { api, apiError, apiErrorCode } from '../../services/api';
import { useLiveEventStore, type NearbyIntentPayload } from '../../stores/liveEventStore';

const TAB_BAR_CLEARANCE = 96;

/** Renders exactly one card at a time — the front of the queue. */
export function NearbyIntentQueue() {
  const queue = useLiveEventStore((s) => s.nearbyQueue);
  const dismissNearby = useLiveEventStore((s) => s.dismissNearby);
  const segments = useSegments();
  const insets = useSafeAreaInsets();

  const current = queue[0];
  if (!current) return null;

  const onTabsRoute = segments[0] === '(tabs)';
  const bottomOffset = insets.bottom + (onTabsRoute ? TAB_BAR_CLEARANCE : spacing.xl);

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: spacing.lg,
        right: spacing.lg,
        bottom: bottomOffset,
        zIndex: 50,
      }}
    >
      <NearbyIntentCard
        key={current.intentId}
        payload={current}
        onDismiss={() => dismissNearby(current.intentId)}
      />
    </View>
  );
}

function mmss(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function GlassChip({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: radius.pill,
        backgroundColor: 'rgba(255,255,255,0.28)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.45)',
      }}
    >
      {children}
    </View>
  );
}

function InfoPill({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 3, flex: 1 }}>
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: radius.sm,
          backgroundColor: colors.surfaceSunken,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 15 }}>{icon}</Text>
      </View>
      <Text style={[type.caption, { fontSize: 10.5, textAlign: 'center' }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function NearbyIntentCard({
  payload,
  onDismiss,
}: {
  payload: NearbyIntentPayload;
  onDismiss: () => void;
}) {
  const router = useRouter();
  const pushToast = useLiveEventStore((s) => s.pushToast);

  const [status, setStatus] = useState<'idle' | 'submitting' | 'done'>('idle');
  const [remainingMs, setRemainingMs] = useState(
    () => new Date(payload.expiresAt).getTime() - Date.now()
  );

  // A live, ticking countdown is what makes this read as a real-time event
  // rather than a static card — and it self-dismisses the moment the window
  // for responding actually closes.
  useEffect(() => {
    const tick = () => {
      const ms = new Date(payload.expiresAt).getTime() - Date.now();
      setRemainingMs(ms);
      if (ms <= 0) onDismiss();
    };
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [payload.expiresAt, onDismiss]);

  const hero = vibeHero[payload.vibeTag] ?? vibeHero.CASUAL;
  const vibeMeta = vibes[payload.vibeTag] ?? vibes.CASUAL;
  const tierMeta = trustTiers[payload.creator.trustTier] ?? trustTiers.TIER_1;

  const respond = async () => {
    if (payload.requiresFaceVerification) {
      onDismiss();
      router.push(`/face/enroll?mode=enroll&next=/intent/${payload.intentId}` as never);
      return;
    }

    setStatus('submitting');
    try {
      await api.post(`/intents/${payload.intentId}/respond`, {});
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined
      );
      setStatus('done');
      setTimeout(onDismiss, 900);
    } catch (err) {
      onDismiss();
      pushToast({
        emoji: '⚠️',
        title: 'Could not respond',
        body: apiErrorCode(err) === 'CONFLICT' ? "You're already in on this one." : apiError(err),
        tone: 'danger',
      });
    }
  };

  const openDetail = () => {
    onDismiss();
    router.push(`/intent/${payload.intentId}` as never);
  };

  const openProfile = () => {
    onDismiss();
    router.push(`/profile/${payload.creator.username}` as never);
  };

  const joined = new Date(payload.creator.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
  });

  return (
    <Animated.View
      entering={SlideInDown.springify().damping(17).mass(0.8)}
      exiting={FadeOutDown.duration(180)}
    >
      <View
        style={[
          {
            borderRadius: radius.xl,
            backgroundColor: colors.surface,
            overflow: 'hidden',
          },
          shadows.clayLg,
        ]}
      >
        {/* ── hero ─────────────────────────────────────────────────── */}
        <Pressable onPress={openDetail}>
          <LinearGradient
            colors={hero.colors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ padding: spacing.lg, paddingTop: spacing.md, minHeight: 118, justifyContent: 'space-between' }}
          >
            <Text
              style={{
                position: 'absolute',
                right: -6,
                bottom: -18,
                fontSize: 88,
                opacity: 0.16,
              }}
            >
              {payload.activityEmoji}
            </Text>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <GlassChip>
                <Text style={{ fontSize: 11 }}>{vibeMeta.emoji}</Text>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>
                  {vibeMeta.label}
                </Text>
              </GlassChip>
              <GlassChip>
                <Text style={{ fontSize: 10 }}>📍</Text>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>
                  {payload.distanceLabel ?? 'nearby'}
                </Text>
              </GlassChip>
            </View>

            <View style={{ gap: 2 }}>
              <Text
                style={{ fontSize: 20, fontWeight: '800', color: '#fff' }}
                numberOfLines={2}
              >
                {payload.activityEmoji} {payload.title}
              </Text>
              {payload.description ? (
                <Text
                  style={{ fontSize: 12.5, fontWeight: '600', color: 'rgba(255,255,255,0.9)' }}
                  numberOfLines={1}
                >
                  {payload.description}
                </Text>
              ) : null}
            </View>
          </LinearGradient>
        </Pressable>

        {/* ── body ─────────────────────────────────────────────────── */}
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <InfoPill
              icon="🕒"
              label={new Date(payload.scheduledAt).toLocaleTimeString(undefined, {
                hour: 'numeric',
                minute: '2-digit',
              })}
            />
            <InfoPill icon="📍" label={payload.locationName} />
            <InfoPill
              icon="👥"
              label={payload.groupSize === 1 ? '1 person' : `${payload.groupSize} people`}
            />
          </View>

          <Pressable
            onPress={openProfile}
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
          >
            <Avatar uri={payload.creator.avatarUrl} name={payload.creator.name} size={44} />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[type.body, { fontWeight: '800' }]} numberOfLines={1}>
                  {payload.creator.name}
                </Text>
                <TrustBadge tier={payload.creator.trustTier} score={payload.creator.trustScore} compact />
              </View>
              <Text style={type.caption}>
                {payload.creator.companionsMet} companion{payload.creator.companionsMet === 1 ? '' : 's'} met
                {' · '}Joined {joined}
              </Text>
            </View>
            <Text style={{ color: colors.primaryDeep, fontWeight: '800', fontSize: 12 }}>
              View →
            </Text>
          </Pressable>

          {payload.creator.interestTags.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {payload.creator.interestTags.slice(0, 3).map((t) => (
                <View
                  key={t}
                  style={{
                    paddingHorizontal: 9,
                    paddingVertical: 4,
                    borderRadius: radius.pill,
                    backgroundColor: colors.surfaceSunken,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textMuted }}>
                    {t}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              paddingVertical: 6,
            }}
          >
            <Text style={{ fontSize: 11, color: tierMeta.color, fontWeight: '900' }}>
              {tierMeta.icon}
            </Text>
            <Text style={[type.caption, { fontWeight: '700' }]}>
              {tierMeta.label}
              {payload.creator.faceVerified ? ' · Face verified' : ''}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            <Text style={{ fontSize: 11 }}>⏳</Text>
            <Text style={[type.caption, { fontWeight: '800', color: colors.primaryDeep }]}>
              Closes in {mmss(remainingMs)}
            </Text>
          </View>

          {/* ── response buttons — the whole point of the card ──────── */}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <ClayButton
              title="Not now"
              variant="secondary"
              onPress={onDismiss}
              style={{ flex: 1 }}
              disabled={status !== 'idle'}
            />
            <ClayButton
              title={status === 'done' ? "You're in ✓" : "I'm interested →"}
              variant="primary"
              onPress={respond}
              loading={status === 'submitting'}
              disabled={status === 'done'}
              style={{ flex: 2 }}
            />
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

export default NearbyIntentQueue;
