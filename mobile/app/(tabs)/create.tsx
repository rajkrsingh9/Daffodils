import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  Badge,
  ClayCard,
  Screen,
  SectionTitle,
} from '../../components/shared';
import { clayEdge, colors, radius, shadows, spacing, type } from '../../constants/theme';
import { api, unwrap } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';

interface Quota {
  used: number;
  limit: number;
  remaining: number;
}

interface Draft {
  id: string;
  caption: string;
  createdAt: string;
}

export default function CreateTab() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [quota, setQuota] = useState<Quota | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);

  useFocusEffect(
    useCallback(() => {
      unwrap<Quota>(api.get('/posts/me/quota')).then(setQuota).catch(() => undefined);
      unwrap<Draft[]>(api.get('/posts/me/drafts')).then(setDrafts).catch(() => undefined);
    }, [])
  );

  const goToIntent = () =>
    router.push(
      user?.faceVerified
        ? '/intent/compose'
        : '/face/enroll?mode=enroll&next=/intent/compose'
    );

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.lg,
          paddingBottom: spacing.xxl * 2,
          gap: spacing.lg,
        }}
      >
        <View>
          <Text style={[type.caption, { marginBottom: 2 }]}>What are you sharing?</Text>
          <Text style={type.display}>Create</Text>
        </View>

        <BigChoice
          emoji="⚡️"
          accent={colors.primary}
          accentSoft={colors.primarySoft}
          title="Create an intent"
          body="Say what you want to do and when. It broadcasts to people inside the radius you pick — they raise a hand, you choose."
          badge={
            user?.faceVerified ? undefined : (
              <Badge label="NEEDS FACE VERIFICATION" color={colors.warning} soft={colors.surface} />
            )
          }
          onPress={goToIntent}
        />

        <BigChoice
          emoji="📸"
          accent={colors.sky}
          accentSoft={colors.skySoft}
          title="Create a post"
          body="A moment, a vibe check, or a wishlist drop. Posts build the profile people see before they agree to meet you."
          badge={
            quota ? (
              <Badge
                label={`${quota.remaining} OF ${quota.limit} LEFT TODAY`}
                color={quota.remaining ? colors.textMuted : colors.danger}
                soft={quota.remaining ? colors.surfaceSunken : colors.dangerSoft}
              />
            ) : undefined
          }
          disabled={quota?.remaining === 0}
          disabledNote="You've hit today's 3-post limit. It keeps the feed from flooding — try again tomorrow."
          onPress={() => router.push('/post/compose')}
        />

        {drafts.length > 0 ? (
          <View>
            <SectionTitle
              title="Activity log drafts"
              subtitle="Auto-written after your activities — publish only if you want to"
            />
            <View style={{ gap: spacing.md }}>
              {drafts.map((d) => (
                <Pressable
                  key={d.id}
                  onPress={() => router.push(`/post/publish/${d.id}`)}
                >
                  <ClayCard depth="sm" style={{ gap: spacing.sm }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <Text style={{ fontSize: 18 }}>🗓</Text>
                      <Badge label="DRAFT" color={colors.mint} soft={colors.mintSoft} />
                    </View>
                    <Text style={type.body} numberOfLines={2}>
                      {d.caption}
                    </Text>
                    <Text style={{ color: colors.primaryDeep, fontWeight: '800', fontSize: 13 }}>
                      Review & publish →
                    </Text>
                  </ClayCard>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <ClayCard tone="sunken" depth="none">
          <Text style={type.label}>WHY THE LIMITS</Text>
          <Text style={[type.bodyMuted, { marginTop: spacing.sm }]}>
            Three posts a day, no reposting, no follower counts. Daffodils ranks what you see
            by distance and shared interests — never by popularity — so the feed stays a
            picture of your area rather than a leaderboard.
          </Text>
        </ClayCard>
      </ScrollView>
    </Screen>
  );
}

function BigChoice({
  emoji,
  title,
  body,
  accent,
  accentSoft,
  badge,
  onPress,
  disabled,
  disabledNote,
}: {
  emoji: string;
  title: string;
  body: string;
  accent: string;
  accentSoft: string;
  badge?: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  disabledNote?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => ({
        opacity: disabled ? 0.6 : pressed ? 0.92 : 1,
        transform: [{ translateY: pressed && !disabled ? 2 : 0 }],
      })}
    >
      <ClayCard style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View
            style={[
              {
                width: 56,
                height: 56,
                borderRadius: radius.md,
                backgroundColor: accentSoft,
                alignItems: 'center',
                justifyContent: 'center',
              },
              clayEdge,
              shadows.claySm,
            ]}
          >
            <Text style={{ fontSize: 26 }}>{emoji}</Text>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={type.title}>{title}</Text>
            {badge}
          </View>
          <Text style={{ fontSize: 22, color: accent, fontWeight: '800' }}>›</Text>
        </View>

        <Text style={type.bodyMuted}>{body}</Text>

        {disabled && disabledNote ? (
          <Text style={[type.caption, { color: colors.danger }]}>{disabledNote}</Text>
        ) : null}
      </ClayCard>
    </Pressable>
  );
}
