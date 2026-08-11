import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
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
  formatCountdown,
  timeAgo,
} from '../../../components/shared';
import { colors, radius, spacing, type } from '../../../constants/theme';
import { api, apiError, unwrap } from '../../../services/api';
import { getSocket } from '../../../services/socket';

interface Responder {
  id: string;
  status: 'YES' | 'SELECTED' | 'CONFIRMED' | 'DECLINED' | 'WITHDRAWN' | 'PASSED_OVER';
  message: string | null;
  createdAt: string;
  distanceLabel: string | null;
  sharedInterests: string[];
  reviewCount: number;
  responder: {
    id: string;
    name: string;
    username: string;
    avatarUrl: string | null;
    bio: string | null;
    trustTier: 'TIER_1' | 'TIER_2' | 'TIER_3';
    trustScore: string | number;
    activitiesDone: number;
    companionsMet: number;
    interestTags: string[];
  };
}

interface MyIntent {
  id: string;
  title: string;
  activityEmoji: string;
  status: string;
  expiresAt: string;
  groupSize: number;
  filledSlots: number;
  responseCount: number;
  reach: number;
}

export default function MakerDashboard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [responders, setResponders] = useState<Responder[]>([]);
  const [intent, setIntent] = useState<MyIntent | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [choosing, setChoosing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (!id) return;
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const [list, mine] = await Promise.all([
        unwrap<Responder[]>(api.get(`/intents/${id}/responses`)),
        unwrap<MyIntent[]>(api.get('/intents/mine')),
      ]);
      setResponders(list);
      setIntent(mine.find((i) => i.id === id) ?? null);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  // The dashboard is explicitly "live" in the workflow — a new hand should
  // appear without the maker pulling to refresh.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onResponse = () => void load(true);
    const onDeclined = () => {
      void load(true);
      Alert.alert('They passed', 'Pick someone else from the list.');
    };
    const onConfirmed = (payload: { matchId: string }) => {
      router.replace(`/match/${payload.matchId}`);
    };

    socket.on('intent:response', onResponse);
    socket.on('intent:declined', onDeclined);
    socket.on('match:confirmed', onConfirmed);

    return () => {
      socket.off('intent:response', onResponse);
      socket.off('intent:declined', onDeclined);
      socket.off('match:confirmed', onConfirmed);
    };
  }, [load, router]);

  const choose = async (responseId: string, name: string) => {
    Alert.alert(
      `Choose ${name}?`,
      'They will be asked to confirm. Until they accept, nobody else can be selected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Choose',
          onPress: async () => {
            setChoosing(responseId);
            try {
              await api.post(`/intents/${id}/select`, { responseId });
              await load(true);
            } catch (err) {
              Alert.alert('Could not choose', apiError(err));
            } finally {
              setChoosing(null);
            }
          },
        },
      ]
    );
  };

  const cancelIntent = () =>
    Alert.alert('Cancel this intent?', 'Everyone who raised a hand will be told.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel intent',
        style: 'destructive',
        onPress: async () => {
          await api.delete(`/intents/${id}`).catch(() => undefined);
          router.replace('/(tabs)/nearby');
        },
      },
    ]);

  const pendingSelection = responders.find((r) => r.status === 'SELECTED');
  const expiresInMs = intent ? new Date(intent.expiresAt).getTime() - Date.now() : 0;

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader
        title="Your responders"
        subtitle={intent ? `${intent.activityEmoji} ${intent.title}` : undefined}
        onBack
      />

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={colors.primaryDeep}
          />
        }
      >
        {intent ? (
          <ClayCard tone="primary" style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', gap: spacing.lg }}>
              <Stat label="Reached" value={intent.reach} />
              <Stat label="Raised a hand" value={intent.responseCount} />
              <Stat
                label="Spots left"
                value={Math.max(intent.groupSize - intent.filledSlots, 0)}
              />
            </View>
            <Text style={type.caption}>
              {expiresInMs > 0
                ? `Accepting hands · ${formatCountdown(expiresInMs)}`
                : 'No longer accepting hands'}
            </Text>
          </ClayCard>
        ) : null}

        {pendingSelection ? (
          <ClayCard depth="sm" style={{ gap: spacing.sm }}>
            <Badge label="WAITING FOR CONFIRMATION" color={colors.warning} soft={colors.primarySoft} dot />
            <Text style={type.body}>
              You chose {pendingSelection.responder.name}. They have been notified — you can
              pick someone else if they decline.
            </Text>
          </ClayCard>
        ) : null}

        {loading ? (
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primaryDeep} />
        ) : responders.length === 0 ? (
          <EmptyState
            emoji="⏳"
            title="No hands raised yet"
            body={
              error ??
              'Your intent went out to everyone nearby. Give it a few minutes — or widen the radius and broadcast again.'
            }
            action={
              <ClayButton
                title="Broadcast again"
                variant="secondary"
                onPress={async () => {
                  try {
                    const r = await unwrap<{ notified: number }>(
                      api.post(`/intents/${id}/rebroadcast`)
                    );
                    Alert.alert(
                      'Broadcast sent',
                      r.notified
                        ? `Reached ${r.notified} more ${r.notified === 1 ? 'person' : 'people'}.`
                        : 'Everyone nearby has already been notified.'
                    );
                    await load(true);
                  } catch (err) {
                    Alert.alert('Could not broadcast', apiError(err));
                  }
                }}
              />
            }
          />
        ) : (
          <>
            <SectionTitle
              title={`${responders.length} interested`}
              subtitle="Closest, most-trusted and most in common first"
            />
            {responders.map((r) => (
              <ResponderCard
                key={r.id}
                item={r}
                busy={choosing === r.id}
                disabled={Boolean(pendingSelection) && r.status !== 'SELECTED'}
                onChoose={() => choose(r.id, r.responder.name)}
                onOpenProfile={() => router.push(`/profile/${r.responder.username}`)}
              />
            ))}
          </>
        )}

        {intent?.status === 'ACTIVE' ? (
          <ClayButton title="Cancel this intent" variant="ghost" full onPress={cancelIntent} />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function ResponderCard({
  item,
  onChoose,
  onOpenProfile,
  busy,
  disabled,
}: {
  item: Responder;
  onChoose: () => void;
  onOpenProfile: () => void;
  busy: boolean;
  disabled: boolean;
}) {
  const selected = item.status === 'SELECTED';
  const resolved = ['DECLINED', 'WITHDRAWN', 'PASSED_OVER'].includes(item.status);

  return (
    <ClayCard style={{ gap: spacing.md, opacity: resolved ? 0.55 : 1 }}>
      <Pressable onPress={onOpenProfile}>
        <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
          <Avatar uri={item.responder.avatarUrl} name={item.responder.name} size={54} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={type.heading}>{item.responder.name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
              <DistanceBadge label={item.distanceLabel} />
              <Text style={type.caption}>{timeAgo(item.createdAt)}</Text>
            </View>
            <TrustBadge tier={item.responder.trustTier} score={item.responder.trustScore} />
          </View>

          {selected ? (
            <Badge label="CHOSEN" color={colors.warning} soft={colors.primarySoft} dot />
          ) : resolved ? (
            <Badge label={item.status} color={colors.textFaint} soft={colors.surfaceSunken} />
          ) : null}
        </View>
      </Pressable>

      {item.responder.bio ? (
        <Text style={type.bodyMuted} numberOfLines={2}>
          {item.responder.bio}
        </Text>
      ) : null}

      {item.message ? (
        <View
          style={{
            padding: spacing.md,
            borderRadius: radius.md,
            backgroundColor: colors.surfaceSunken,
          }}
        >
          <Text style={type.body}>“{item.message}”</Text>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: spacing.xl }}>
        <Stat label="Activities" value={item.responder.activitiesDone} small />
        <Stat label="Companions" value={item.responder.companionsMet} small />
        <Stat label="Reviews" value={item.reviewCount} small />
      </View>

      {/* Shared interests are highlighted — the spec calls this out explicitly. */}
      {item.responder.interestTags.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {item.responder.interestTags.slice(0, 8).map((t) =>
            item.sharedInterests.includes(t) ? (
              <Badge key={t} label={`${t} ✓`} color={colors.primaryDeep} soft={colors.primarySoft} />
            ) : (
              <TagChip key={t} label={t} />
            )
          )}
        </View>
      ) : null}

      {!resolved && !selected ? (
        <ClayButton
          title="Choose →"
          full
          loading={busy}
          disabled={disabled}
          onPress={onChoose}
        />
      ) : null}
    </ClayCard>
  );
}

function Stat({ label, value, small }: { label: string; value: number; small?: boolean }) {
  return (
    <View>
      <Text style={[type.heading, small ? { fontSize: 15 } : undefined]}>{value}</Text>
      <Text style={type.caption}>{label}</Text>
    </View>
  );
}
