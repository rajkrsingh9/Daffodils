import React, { ReactNode } from 'react';
import { Image, Pressable, StyleProp, Text, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  clayEdge,
  colors,
  radius,
  shadows,
  spacing,
  trustTier as trustTiers,
  type,
  vibe as vibes,
  VibeKey,
} from '../../constants/theme';
import { Badge } from './Clay';

export * from './Clay';

// ──────────────────────────────────────────────────────────────── screen ──

export function Screen({
  children,
  style,
  edges = ['top'],
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={edges}>
      <View style={[{ flex: 1 }, style]}>{children}</View>
    </SafeAreaView>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack?: boolean | (() => void);
  right?: ReactNode;
}) {
  const router = useRouter();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.sm,
        paddingBottom: spacing.md,
      }}
    >
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => (typeof onBack === 'function' ? onBack() : router.back())}
          style={[
            {
              width: 40,
              height: 40,
              borderRadius: radius.md,
              backgroundColor: colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
            },
            shadows.claySm,
            clayEdge,
          ]}
        >
          <Text style={{ fontSize: 18, color: colors.text, marginTop: -2 }}>‹</Text>
        </Pressable>
      ) : null}

      <View style={{ flex: 1 }}>
        <Text style={type.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[type.caption, { marginTop: 2 }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {right}
    </View>
  );
}

// ──────────────────────────────────────────────────────────────── avatar ──

const AVATAR_TONES = [
  colors.primarySoft,
  colors.lavenderSoft,
  colors.mintSoft,
  colors.coralSoft,
  colors.skySoft,
];

export function Avatar({
  uri,
  name,
  size = 44,
  ring,
}: {
  uri?: string | null;
  name?: string | null;
  size?: number;
  /** Draws the "intent live" ring around the avatar. */
  ring?: boolean;
}) {
  const initials = (name ?? '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

  // Stable per-person tint so avatars stay recognisable without a photo.
  const tone =
    AVATAR_TONES[
      Math.abs(
        (name ?? '').split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)
      ) % AVATAR_TONES.length
    ];

  const inner = uri ? (
    <Image
      source={{ uri }}
      style={{ width: size, height: size, borderRadius: size / 3 }}
      accessibilityIgnoresInvertColors
    />
  ) : (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 3,
          backgroundColor: tone,
          alignItems: 'center',
          justifyContent: 'center',
        },
        clayEdge,
      ]}
    >
      <Text style={{ fontSize: size * 0.36, fontWeight: '800', color: colors.text }}>
        {initials}
      </Text>
    </View>
  );

  if (!ring) return <View style={shadows.claySm}>{inner}</View>;

  return (
    <View
      style={[
        {
          padding: 2.5,
          borderRadius: size / 3 + 3,
          borderWidth: 2.5,
          borderColor: colors.success,
        },
        shadows.claySm,
      ]}
    >
      {inner}
    </View>
  );
}

// ───────────────────────────────────────────────────────────────── badges ──

export function TrustBadge({
  tier,
  score,
  compact,
}: {
  tier: keyof typeof trustTiers;
  score?: string | number;
  compact?: boolean;
}) {
  const t = trustTiers[tier] ?? trustTiers.TIER_1;
  const numeric = Number(score ?? 0);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingHorizontal: 9,
          paddingVertical: 4,
          borderRadius: radius.pill,
          backgroundColor: t.soft,
        }}
      >
        <Text style={{ fontSize: 11, color: t.color, fontWeight: '900' }}>{t.icon}</Text>
        {!compact && (
          <Text style={{ fontSize: 11, fontWeight: '800', color: t.color }}>{t.label}</Text>
        )}
      </View>
      {numeric > 0 && (
        <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textMuted }}>
          ★ {numeric.toFixed(1)}
        </Text>
      )}
    </View>
  );
}

export function VibeTag({ tag, size = 'md' }: { tag: VibeKey; size?: 'sm' | 'md' }) {
  const v = vibes[tag] ?? vibes.CASUAL;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: size === 'sm' ? 8 : 10,
        paddingVertical: size === 'sm' ? 4 : 6,
        borderRadius: radius.pill,
        backgroundColor: v.soft,
      }}
    >
      <Text style={{ fontSize: size === 'sm' ? 10 : 12 }}>{v.emoji}</Text>
      <Text
        style={{
          fontSize: size === 'sm' ? 10 : 12,
          fontWeight: '800',
          color: v.color,
        }}
      >
        {v.label}
      </Text>
    </View>
  );
}

export function DistanceBadge({ label }: { label?: string | null }) {
  if (!label) return null;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: radius.pill,
        backgroundColor: colors.surfaceSunken,
      }}
    >
      <Text style={{ fontSize: 10 }}>📍</Text>
      <Text style={{ fontSize: 11, fontWeight: '800', color: colors.textMuted }}>
        {label}
      </Text>
    </View>
  );
}

/** The "Intent live 🟢" badge from the feed spec. */
export function IntentLiveBadge() {
  return <Badge label="INTENT LIVE" color={colors.success} soft={colors.mintSoft} dot />;
}

export function TagChip({ label }: { label: string }) {
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: radius.pill,
        backgroundColor: colors.surfaceSunken,
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textMuted }}>
        {label}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────── SOS ──

export function SOSButton({ onPress, size = 56 }: { onPress: () => void; size?: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Send an SOS alert to your trusted contact"
      onLongPress={() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
          () => undefined
        );
        onPress();
      }}
      delayLongPress={600}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2.6,
          backgroundColor: colors.danger,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ translateY: pressed ? 2 : 0 }],
        },
        pressed ? shadows.clayPressed : shadows.clay,
        clayEdge,
      ]}
    >
      <Text style={{ fontSize: 11, fontWeight: '900', color: colors.onDark }}>SOS</Text>
      <Text style={{ fontSize: 7, fontWeight: '700', color: 'rgba(255,255,255,0.85)' }}>
        HOLD
      </Text>
    </Pressable>
  );
}

// ───────────────────────────────────────────────────────────────── utils ──

/** Compact relative time — "just now", "12m", "3h", "5d", then a date. */
export function timeAgo(iso: string | Date): string {
  const then = new Date(iso).getTime();
  const seconds = Math.floor((Date.now() - then) / 1000);

  if (seconds < 45) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604_800) return `${Math.floor(seconds / 86_400)}d`;

  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** "Today 6:30 pm" / "Tomorrow 9:00 am" / "Sat 14 Jun, 7:00 pm" */
export function formatWhen(iso: string | Date): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(date) - startOfDay(new Date())) / 86_400_000);

  if (dayDiff === 0) return `Today ${time}`;
  if (dayDiff === 1) return `Tomorrow ${time}`;
  if (dayDiff === -1) return `Yesterday ${time}`;

  return `${date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })}, ${time}`;
}

/** Countdown for chat-room expiry and intent expiry. */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'closed';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m left`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m left`;
  return `${Math.floor(hours / 24)}d left`;
}
