import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Chip, ClayButton, Screen, ScreenHeader } from '../../components/shared';
import { INTEREST_OPTIONS, config } from '../../constants/config';
import { colors, spacing, type } from '../../constants/theme';
import { useOnboardingStore } from '../../stores/onboardingStore';

/** Onboarding 4/5 — interest tag picker, minimum 3. */
export default function InterestsStep() {
  const router = useRouter();
  const { interestTags, toggleInterest } = useOnboardingStore();

  const remaining = config.minInterestTags - interestTags.length;

  return (
    <Screen>
      <ScreenHeader title="What are you into?" subtitle="Step 4 of 5" onBack />

      <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.xl }}>
        <Text style={type.bodyMuted}>
          Pick at least {config.minInterestTags}. Shared interests are highlighted when
          someone considers you as a companion — they are how strangers find common ground.
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {INTEREST_OPTIONS.map((tag) => (
            <Chip
              key={tag}
              label={tag}
              selected={interestTags.includes(tag)}
              onPress={() => toggleInterest(tag)}
            />
          ))}
        </View>
      </ScrollView>

      <View
        style={{
          padding: spacing.xl,
          gap: spacing.sm,
          borderTopWidth: 1,
          borderTopColor: colors.borderSoft,
          backgroundColor: colors.bg,
        }}
      >
        <Text style={[type.caption, { textAlign: 'center' }]}>
          {remaining > 0
            ? `Choose ${remaining} more`
            : `${interestTags.length} selected`}
        </Text>
        <ClayButton
          title="Continue"
          full
          size="lg"
          disabled={interestTags.length < config.minInterestTags}
          onPress={() => router.push('/onboarding/permissions')}
        />
      </View>
    </Screen>
  );
}
