import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  Avatar,
  Badge,
  ClayButton,
  ClayCard,
  EmptyState,
  Screen,
  ScreenHeader,
  SectionTitle,
  TrustBadge,
  formatWhen,
} from '../../components/shared';
import { clayEdge, colors, radius, shadows, spacing, type } from '../../constants/theme';
import { api, apiError, unwrap } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';

interface Match {
  id: string;
  status: 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
  role: 'maker' | 'companion';
  hasRated: boolean;
  safetyTips: string[];
  intent: {
    id: string;
    title: string;
    activityEmoji: string;
    locationName: string;
    scheduledAt: string;
  };
  maker: { id: string; name: string; username: string; avatarUrl: string | null; trustTier: 'TIER_1' | 'TIER_2' | 'TIER_3'; trustScore: string | number };
  companion: { id: string; name: string; username: string; avatarUrl: string | null; trustTier: 'TIER_1' | 'TIER_2' | 'TIER_3'; trustScore: string | number };
  partner: { id: string; name: string; username: string; avatarUrl: string | null; trustTier: 'TIER_1' | 'TIER_2' | 'TIER_3'; trustScore: string | number };
  chatRoom: { id: string; status: string; expiresAt: string } | null;
}

export default function MatchConfirmation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const me = useAuthStore((s) => s.user);

  const [match, setMatch] = useState<Match | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setMatch(await unwrap<Match>(api.get(`/matches/${id}`)));
    } catch (err) {
      setError(apiError(err));
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const complete = () =>
    Alert.alert(
      'Mark as done?',
      'This closes the chat and asks you both to rate each other. You will each get an optional activity-log draft.',
      [
        { text: 'Not yet', style: 'cancel' },
        {
          text: 'Mark done',
          onPress: async () => {
            setBusy(true);
            try {
              await api.post(`/matches/${id}/complete`);
              router.replace(`/rate/${id}`);
            } catch (err) {
              Alert.alert('Could not complete', apiError(err));
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );

  const cancel = () =>
    Alert.alert('Cancel this plan?', 'Your companion will be told.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel plan',
        style: 'destructive',
        onPress: async () => {
          await api.post(`/matches/${id}/cancel`, {}).catch(() => undefined);
          router.replace('/(tabs)/chat');
        },
      },
    ]);

  if (error && !match) {
    return (
      <Screen>
        <ScreenHeader title="Match" onBack />
        <EmptyState emoji="🚫" title="Match unavailable" body={error} />
      </Screen>
    );
  }

  if (!match) {
    return (
      <Screen>
        <ScreenHeader title="Match" onBack />
        <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.primaryDeep} />
      </Screen>
    );
  }

  const isCompleted = match.status === 'COMPLETED';

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader title="It's a match" onBack />

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}
      >
        {/* celebration */}
        <View style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg }}>
          <Text style={{ fontSize: 52 }}>🌼</Text>
          <Text style={[type.display, { textAlign: 'center' }]}>
            {isCompleted ? 'Activity complete' : "You're set"}
          </Text>
          <Text style={[type.bodyMuted, { textAlign: 'center' }]}>
            {isCompleted
              ? 'Hope it went well. Rate your companion to update their trust score.'
              : 'You both said yes. Here is the plan.'}
          </Text>
        </View>

        {/* the two people */}
        <ClayCard>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg }}>
            <Person person={match.maker} caption="Organiser" isMe={match.maker.id === me?.id} />
            <View
              style={[
                {
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: colors.primarySoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                },
                shadows.claySm,
                clayEdge,
              ]}
            >
              <Text style={{ fontSize: 18 }}>🤝</Text>
            </View>
            <Person person={match.companion} caption="Companion" isMe={match.companion.id === me?.id} />
          </View>
        </ClayCard>

        {/* the plan */}
        <ClayCard style={{ gap: spacing.md }}>
          <SectionTitle title="The plan" />
          <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: radius.md,
                backgroundColor: colors.primarySoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 26 }}>{match.intent.activityEmoji}</Text>
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={type.heading}>{match.intent.title}</Text>
              <Text style={type.caption}>📍 {match.intent.locationName}</Text>
              <Text style={[type.caption, { color: colors.primaryDeep, fontWeight: '800' }]}>
                🕒 {formatWhen(match.intent.scheduledAt)}
              </Text>
            </View>
          </View>
        </ClayCard>

        {/* safety */}
        <ClayCard tone="sunken" depth="none" style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Text style={{ fontSize: 18 }}>🛟</Text>
            <Text style={type.heading}>Before you go</Text>
          </View>
          {match.safetyTips.map((tip) => (
            <View key={tip} style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Text style={{ color: colors.primaryDeep, fontWeight: '900' }}>·</Text>
              <Text style={[type.bodyMuted, { flex: 1 }]}>{tip}</Text>
            </View>
          ))}
          <ClayButton
            title="Set a trusted contact"
            variant="secondary"
            size="sm"
            style={{ marginTop: spacing.sm }}
            onPress={() => router.push('/settings/trusted-contact')}
          />
        </ClayCard>

        {/* actions */}
        {isCompleted ? (
          match.hasRated ? (
            <Badge label="YOU'VE RATED THIS ACTIVITY" color={colors.success} soft={colors.mintSoft} />
          ) : (
            <ClayButton
              title="Rate your companion"
              full
              size="lg"
              onPress={() => router.push(`/rate/${match.id}`)}
            />
          )
        ) : (
          <>
            <ClayButton
              title="Open chat →"
              full
              size="lg"
              onPress={() =>
                match.chatRoom
                  ? router.replace(`/chat/${match.chatRoom.id}`)
                  : router.replace('/(tabs)/chat')
              }
            />
            <ClayButton
              title="Mark activity as done"
              variant="secondary"
              full
              loading={busy}
              onPress={complete}
            />
            <ClayButton title="Cancel plan" variant="ghost" full onPress={cancel} />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Person({
  person,
  caption,
  isMe,
}: {
  person: Match['partner'];
  caption: string;
  isMe: boolean;
}) {
  return (
    <View style={{ alignItems: 'center', gap: 6, flex: 1 }}>
      <Avatar uri={person.avatarUrl} name={person.name} size={64} />
      <Text style={[type.body, { fontWeight: '800' }]} numberOfLines={1}>
        {isMe ? 'You' : person.name}
      </Text>
      <Text style={type.caption}>{caption}</Text>
      <TrustBadge tier={person.trustTier} score={person.trustScore} compact />
    </View>
  );
}
