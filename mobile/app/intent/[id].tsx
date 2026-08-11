import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  Avatar,
  Badge,
  ClayButton,
  ClayCard,
  DistanceBadge,
  EmptyState,
  Screen,
  ScreenHeader,
  SectionTitle,
  TagChip,
  TrustBadge,
  VibeTag,
  formatCountdown,
  formatWhen,
  timeAgo,
} from '../../components/shared';
import { colors, radius, spacing, type, VibeKey } from '../../constants/theme';
import { api, apiError, apiErrorCode, unwrap } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';

interface IntentDetail {
  id: string;
  title: string;
  description: string | null;
  activityEmoji: string;
  locationName: string;
  scheduledAt: string;
  expiresAt: string;
  groupSize: number;
  filledSlots: number;
  slotsRemaining: number;
  vibeTag: VibeKey;
  radiusKm: number;
  status: string;
  responseCount: number;
  distanceLabel: string | null;
  isMine: boolean;
  sharedInterests: string[];
  myResponse: { id: string; status: string } | null;
  creator: {
    id: string;
    name: string;
    username: string;
    avatarUrl: string | null;
    bio: string | null;
    city: string | null;
    trustTier: 'TIER_1' | 'TIER_2' | 'TIER_3';
    trustScore: string | number;
    activitiesDone: number;
    companionsMet: number;
    interestTags: string[];
  };
  creatorRecentPosts: {
    id: string;
    type: string;
    caption: string;
    mediaUrls: string[];
    likeCount: number;
    createdAt: string;
  }[];
}

export default function IntentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [intent, setIntent] = useState<IntentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setIntent(await unwrap<IntentDetail>(api.get(`/intents/${id}`)));
    } catch (err) {
      setError(apiError(err));
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const respond = async () => {
    setBusy(true);
    try {
      await api.post(`/intents/${id}/respond`, {});
      await load();
      Alert.alert(
        "You're in 🙌",
        `${intent?.creator.name} has been told. If they pick you, you'll get a notification to confirm.`
      );
    } catch (err) {
      // The face gate is the one failure with a clear next step.
      if (apiErrorCode(err) === 'FACE_VERIFICATION_REQUIRED') {
        Alert.alert(
          'Face verification required',
          'Everyone who joins an intent has passed a face check. It takes about 20 seconds.',
          [
            { text: 'Not now', style: 'cancel' },
            {
              text: 'Verify',
              onPress: () =>
                router.push(`/face/enroll?mode=enroll&next=/intent/${id}`),
            },
          ]
        );
      } else {
        Alert.alert('Could not respond', apiError(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    setBusy(true);
    try {
      await api.delete(`/intents/${id}/respond`);
      await load();
    } catch (err) {
      Alert.alert('Could not withdraw', apiError(err));
    } finally {
      setBusy(false);
    }
  };

  if (error && !intent) {
    return (
      <Screen>
        <ScreenHeader title="Intent" onBack />
        <EmptyState emoji="🚫" title="Intent unavailable" body={error} />
      </Screen>
    );
  }

  if (!intent) {
    return (
      <Screen>
        <ScreenHeader title="Intent" onBack />
        <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.primaryDeep} />
      </Screen>
    );
  }

  const expiresInMs = new Date(intent.expiresAt).getTime() - Date.now();
  const isOpen = intent.status === 'ACTIVE' && expiresInMs > 0;
  const responded = Boolean(intent.myResponse && intent.myResponse.status !== 'WITHDRAWN');

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader title="Intent" onBack />

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}
        showsVerticalScrollIndicator={false}
      >
        {/* headline */}
        <ClayCard style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
            <View
              style={{
                width: 60,
                height: 60,
                borderRadius: radius.lg,
                backgroundColor: colors.primarySoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 30 }}>{intent.activityEmoji}</Text>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={type.title}>{intent.title}</Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
                <VibeTag tag={intent.vibeTag} size="sm" />
                <DistanceBadge label={intent.distanceLabel} />
              </View>
            </View>
          </View>

          {intent.description ? <Text style={type.body}>{intent.description}</Text> : null}

          <View style={{ gap: spacing.sm }}>
            <DetailRow icon="📍" label="Where" value={intent.locationName} />
            <DetailRow icon="🕒" label="When" value={formatWhen(intent.scheduledAt)} />
            <DetailRow
              icon="👥"
              label="Spots"
              value={
                intent.slotsRemaining > 0
                  ? `${intent.slotsRemaining} of ${intent.groupSize} left`
                  : 'Full'
              }
            />
            <DetailRow
              icon="⏳"
              label="Closes"
              value={isOpen ? formatCountdown(expiresInMs) : intent.status.toLowerCase()}
            />
          </View>
        </ClayCard>

        {/* creator preview */}
        <Pressable onPress={() => router.push(`/profile/${intent.creator.username}`)}>
          <ClayCard style={{ gap: spacing.md }}>
            <SectionTitle title="Who's asking" />
            <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
              <Avatar uri={intent.creator.avatarUrl} name={intent.creator.name} size={58} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={type.heading}>{intent.creator.name}</Text>
                <Text style={type.caption}>
                  @{intent.creator.username}
                  {intent.creator.city ? ` · ${intent.creator.city}` : ''}
                </Text>
                <TrustBadge tier={intent.creator.trustTier} score={intent.creator.trustScore} />
              </View>
            </View>

            {intent.creator.bio ? <Text style={type.bodyMuted}>{intent.creator.bio}</Text> : null}

            <View style={{ flexDirection: 'row', gap: spacing.xl }}>
              <Stat label="Companions met" value={intent.creator.companionsMet} />
              <Stat label="Activities done" value={intent.creator.activitiesDone} />
            </View>

            {intent.creator.interestTags.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {intent.creator.interestTags.map((t) =>
                  intent.sharedInterests.includes(t) ? (
                    <Badge key={t} label={`${t} ✓`} color={colors.primaryDeep} soft={colors.primarySoft} />
                  ) : (
                    <TagChip key={t} label={t} />
                  )
                )}
              </View>
            ) : null}

            {intent.sharedInterests.length ? (
              <Text style={[type.caption, { color: colors.success, fontWeight: '800' }]}>
                You share {intent.sharedInterests.length} interest
                {intent.sharedInterests.length === 1 ? '' : 's'}
              </Text>
            ) : null}
          </ClayCard>
        </Pressable>

        {/* recent posts */}
        {intent.creatorRecentPosts.length ? (
          <View style={{ gap: spacing.sm }}>
            <SectionTitle title="Their recent posts" subtitle="Get a sense of them first" />
            {intent.creatorRecentPosts.map((p) => (
              <Pressable key={p.id} onPress={() => router.push(`/post/${p.id}`)}>
                <ClayCard depth="sm" style={{ gap: 4 }}>
                  <Text style={type.body} numberOfLines={2}>
                    {p.caption}
                  </Text>
                  <Text style={type.caption}>
                    💛 {p.likeCount} · {timeAgo(p.createdAt)}
                  </Text>
                </ClayCard>
              </Pressable>
            ))}
          </View>
        ) : null}

        {intent.isMine ? (
          <ClayButton
            title={`View responders (${intent.responseCount})`}
            full
            size="lg"
            onPress={() => router.push(`/intent/dashboard/${intent.id}`)}
          />
        ) : null}
      </ScrollView>

      {/* action bar */}
      {!intent.isMine && isOpen ? (
        <View
          style={{
            flexDirection: 'row',
            gap: spacing.md,
            padding: spacing.lg,
            borderTopWidth: 1,
            borderTopColor: colors.borderSoft,
            backgroundColor: colors.bg,
          }}
        >
          {responded ? (
            <>
              <View style={{ flex: 1, justifyContent: 'center' }}>
                <Badge label="YOU'RE IN — WAITING" color={colors.success} soft={colors.mintSoft} dot />
              </View>
              <ClayButton
                title="Withdraw"
                variant="secondary"
                loading={busy}
                onPress={withdraw}
              />
            </>
          ) : (
            <>
              <ClayButton
                title="Skip"
                variant="secondary"
                onPress={() => router.back()}
                style={{ flex: 1 }}
              />
              <ClayButton
                title="I'm in →"
                size="lg"
                loading={busy}
                disabled={intent.slotsRemaining === 0}
                onPress={respond}
                style={{ flex: 2 }}
              />
            </>
          )}
        </View>
      ) : null}
    </Screen>
  );
}

function DetailRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <Text style={{ fontSize: 15 }}>{icon}</Text>
      <Text style={[type.caption, { width: 62 }]}>{label}</Text>
      <Text style={[type.body, { flex: 1, fontWeight: '700' }]}>{value}</Text>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View>
      <Text style={type.heading}>{value}</Text>
      <Text style={type.caption}>{label}</Text>
    </View>
  );
}
