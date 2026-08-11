import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  Avatar,
  ClayButton,
  ClayCard,
  ClayInput,
  Screen,
  ScreenHeader,
} from '../../components/shared';
import { config } from '../../constants/config';
import { colors, spacing, type } from '../../constants/theme';
import { api, apiError, unwrap } from '../../services/api';

const LABELS = ['', 'Would not meet again', 'Not great', 'Fine', 'Good company', 'Brilliant company'];

export default function RateScreen() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const router = useRouter();

  const [partner, setPartner] = useState<{ name: string; avatarUrl: string | null } | null>(null);
  const [activity, setActivity] = useState<string>('');
  const [score, setScore] = useState(0);
  const [review, setReview] = useState('');
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!matchId) return;
      unwrap<{
        partner: { name: string; avatarUrl: string | null };
        intent: { title: string; activityEmoji: string };
      }>(api.get(`/matches/${matchId}`))
        .then((m) => {
          setPartner(m.partner);
          setActivity(`${m.intent.activityEmoji} ${m.intent.title}`);
        })
        .catch(() => undefined);
    }, [matchId])
  );

  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`/matches/${matchId}/rate`, {
        score,
        review: review.trim() || null,
      });
      Alert.alert('Thanks', 'Their trust score has been updated.', [
        { text: 'Done', onPress: () => router.replace('/(tabs)') },
      ]);
    } catch (err) {
      Alert.alert('Could not submit', apiError(err));
    } finally {
      setBusy(false);
    }
  };

  if (!partner) {
    return (
      <Screen>
        <ScreenHeader title="Rate" onBack />
        <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.primaryDeep} />
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader title="How did it go?" subtitle={activity} onBack />

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <ClayCard style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl }}>
          <Avatar uri={partner.avatarUrl} name={partner.name} size={82} />
          <Text style={type.title}>{partner.name}</Text>

          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable
                key={n}
                accessibilityRole="button"
                accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
                  setScore(n);
                }}
                hitSlop={6}
              >
                <Text style={{ fontSize: 38, opacity: n <= score ? 1 : 0.24 }}>⭐️</Text>
              </Pressable>
            ))}
          </View>

          <Text style={[type.bodyMuted, { minHeight: 21 }]}>{LABELS[score]}</Text>
        </ClayCard>

        <ClayInput
          label="Add a short review (optional)"
          value={review}
          onChangeText={setReview}
          placeholder="Easy company, great conversation."
          multiline
          maxLength={config.reviewLimit}
          counter={{ value: review.length, max: config.reviewLimit }}
        />

        <ClayCard tone="sunken" depth="none">
          <Text style={type.label}>HOW THIS IS USED</Text>
          <Text style={[type.bodyMuted, { marginTop: spacing.sm }]}>
            Your rating feeds their trust score, which is shown on their profile and to anyone
            deciding whether to meet them. Reviews are public and attributed to you.
          </Text>
        </ClayCard>

        <ClayButton
          title="Submit rating"
          full
          size="lg"
          disabled={score === 0}
          loading={busy}
          onPress={submit}
        />
        <ClayButton title="Skip for now" variant="ghost" full onPress={() => router.replace('/(tabs)')} />
      </ScrollView>
    </Screen>
  );
}
