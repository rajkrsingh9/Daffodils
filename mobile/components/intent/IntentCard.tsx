import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Avatar,
  Badge,
  ClayCard,
  DistanceBadge,
  TrustBadge,
  VibeTag,
  formatWhen,
} from '../shared';
import { colors, radius, spacing, type, VibeKey } from '../../constants/theme';

export interface Intent {
  id: string;
  title: string;
  description?: string | null;
  activityEmoji: string;
  locationName: string;
  lat: number;
  lng: number;
  scheduledAt: string;
  groupSize: number;
  filledSlots: number;
  slotsRemaining?: number;
  vibeTag: VibeKey;
  radiusKm: number;
  expiresAt: string;
  status: 'ACTIVE' | 'MATCHED' | 'EXPIRED' | 'CANCELLED' | 'COMPLETED';
  responseCount?: number;
  hasResponded?: boolean;
  distanceLabel?: string | null;
  distanceM?: number | null;
  creator?: {
    id: string;
    name: string;
    username: string;
    avatarUrl: string | null;
    trustTier: 'TIER_1' | 'TIER_2' | 'TIER_3';
    trustScore: string | number;
  };
}

const STATUS_STYLE: Record<string, { label: string; color: string; soft: string }> = {
  ACTIVE: { label: 'LIVE', color: colors.success, soft: colors.mintSoft },
  MATCHED: { label: 'MATCHED', color: colors.lavender, soft: colors.lavenderSoft },
  EXPIRED: { label: 'EXPIRED', color: colors.textFaint, soft: colors.surfaceSunken },
  CANCELLED: { label: 'CANCELLED', color: colors.danger, soft: colors.dangerSoft },
  COMPLETED: { label: 'DONE', color: colors.sky, soft: colors.skySoft },
};

export function IntentCard({
  intent,
  onPress,
  showStatus,
}: {
  intent: Intent;
  onPress?: () => void;
  showStatus?: boolean;
}) {
  const router = useRouter();
  const status = STATUS_STYLE[intent.status] ?? STATUS_STYLE.ACTIVE;
  const remaining =
    intent.slotsRemaining ?? Math.max(intent.groupSize - intent.filledSlots, 0);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress ?? (() => router.push(`/intent/${intent.id}`))}
      style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
    >
      <ClayCard style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: radius.md,
              backgroundColor: colors.primarySoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 24 }}>{intent.activityEmoji}</Text>
          </View>

          <View style={{ flex: 1, gap: 3 }}>
            <Text style={type.heading} numberOfLines={2}>
              {intent.title}
            </Text>
            <Text style={type.caption} numberOfLines={1}>
              📍 {intent.locationName}
            </Text>
            <Text style={[type.caption, { color: colors.primaryDeep, fontWeight: '800' }]}>
              🕒 {formatWhen(intent.scheduledAt)}
            </Text>
          </View>

          {showStatus ? (
            <Badge label={status.label} color={status.color} soft={status.soft} dot />
          ) : null}
        </View>

        {intent.description ? (
          <Text style={type.bodyMuted} numberOfLines={2}>
            {intent.description}
          </Text>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm }}>
          <VibeTag tag={intent.vibeTag} size="sm" />
          <DistanceBadge label={intent.distanceLabel} />
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: radius.pill,
              backgroundColor: remaining > 0 ? colors.surfaceSunken : colors.dangerSoft,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: '800',
                color: remaining > 0 ? colors.textMuted : colors.danger,
              }}
            >
              {remaining > 0 ? `${remaining} spot${remaining > 1 ? 's' : ''} left` : 'Full'}
            </Text>
          </View>
          {intent.hasResponded ? (
            <Badge label="YOU'RE IN" color={colors.success} soft={colors.mintSoft} />
          ) : null}
        </View>

        {intent.creator ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
              paddingTop: spacing.sm,
              borderTopWidth: 1,
              borderTopColor: colors.borderSoft,
            }}
          >
            <Avatar uri={intent.creator.avatarUrl} name={intent.creator.name} size={30} />
            <Text style={[type.caption, { color: colors.text, fontWeight: '700' }]}>
              {intent.creator.name}
            </Text>
            <View style={{ flex: 1 }} />
            <TrustBadge
              tier={intent.creator.trustTier}
              score={intent.creator.trustScore}
              compact
            />
          </View>
        ) : null}
      </ClayCard>
    </Pressable>
  );
}

export default IntentCard;
