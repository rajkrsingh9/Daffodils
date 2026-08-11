import React from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ClayButton, ClayCard, Screen } from '../../components/shared';
import { colors, spacing, type } from '../../constants/theme';

const PILLARS = [
  {
    emoji: '⚡️',
    title: 'Say what you want to do',
    body: 'Post an intent — coffee at six, a walk after work — and it reaches people nearby.',
  },
  {
    emoji: '🤝',
    title: 'You both choose',
    body: 'Interested people raise a hand. You pick one. They confirm. Nobody is matched at random.',
  },
  {
    emoji: '🌼',
    title: 'Posts show who you are',
    body: 'No followers, no virality. Just a picture of your week so people know who they are meeting.',
  },
];

/** Onboarding 1/5 — welcome + value prop. */
export default function Welcome() {
  const router = useRouter();

  return (
    <Screen style={{ padding: spacing.xl, justifyContent: 'space-between' }}>
      <View style={{ gap: spacing.xl, marginTop: spacing.xxl }}>
        <View style={{ alignItems: 'center', gap: spacing.sm }}>
          <Text style={{ fontSize: 64 }}>🌼</Text>
          <Text style={[type.display, { textAlign: 'center' }]}>Daffodils</Text>
          <Text style={[type.bodyMuted, { textAlign: 'center', maxWidth: 300 }]}>
            “I want to do this, at this time — who's in?”
          </Text>
        </View>

        <View style={{ gap: spacing.md }}>
          {PILLARS.map((p) => (
            <ClayCard key={p.title} depth="sm">
              <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
                <Text style={{ fontSize: 26 }}>{p.emoji}</Text>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={type.heading}>{p.title}</Text>
                  <Text style={type.bodyMuted}>{p.body}</Text>
                </View>
              </View>
            </ClayCard>
          ))}
        </View>
      </View>

      <View style={{ gap: spacing.md }}>
        <ClayButton
          title="Get started"
          full
          size="lg"
          onPress={() => router.push('/onboarding/phone')}
        />
        <ClayButton
          title="I already have an account"
          variant="ghost"
          full
          onPress={() => router.push('/auth/login')}
        />
        <Text
          style={[
            type.caption,
            { textAlign: 'center', color: colors.textFaint, paddingHorizontal: spacing.lg },
          ]}
        >
          Daffodils is for real-world company — not dating, not follower counts.
        </Text>
      </View>
    </Screen>
  );
}
