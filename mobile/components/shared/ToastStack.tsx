import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp, Layout } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { GlassCard } from './Clay';
import { colors, radius, spacing, type } from '../../constants/theme';
import { useLiveEventStore, type ToastItem } from '../../stores/liveEventStore';

const TONE_ACCENT: Record<NonNullable<ToastItem['tone']>, string> = {
  default: colors.text,
  success: colors.success,
  warning: colors.warning,
  danger: colors.danger,
};

/**
 * A floating stack of live-event alerts — someone joined your intent, you
 * were chosen, a match landed, a message arrived elsewhere. Mounted once at
 * the root so it surfaces on top of whichever screen the user is actually
 * looking at, the same way a real-time social app's system toasts do.
 */
export function ToastStack() {
  const toasts = useLiveEventStore((s) => s.toasts);
  const insets = useSafeAreaInsets();

  if (!toasts.length) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[
        StyleSheet.absoluteFill,
        { top: insets.top + spacing.sm, paddingHorizontal: spacing.lg, zIndex: 60 },
      ]}
    >
      <View pointerEvents="box-none" style={{ gap: spacing.sm }}>
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} />
        ))}
      </View>
    </View>
  );
}

function ToastCard({ toast }: { toast: ToastItem }) {
  const dismissToast = useLiveEventStore((s) => s.dismissToast);

  useEffect(() => {
    const timer = setTimeout(() => dismissToast(toast.id), toast.durationMs ?? 5000);
    return () => clearTimeout(timer);
  }, [toast.id, toast.durationMs, dismissToast]);

  const accent = TONE_ACCENT[toast.tone ?? 'default'];

  return (
    <Animated.View
      entering={FadeInDown.springify().damping(16).mass(0.7)}
      exiting={FadeOutUp.duration(180)}
      layout={Layout.springify()}
    >
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          Haptics.selectionAsync().catch(() => undefined);
          toast.onPress?.();
          dismissToast(toast.id);
        }}
      >
        <GlassCard tint="deep" radiusKey="lg" style={{ borderLeftWidth: 3, borderLeftColor: accent }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Text style={{ fontSize: 24 }}>{toast.emoji}</Text>
            <View style={{ flex: 1, gap: 1 }}>
              <Text style={type.heading} numberOfLines={1}>
                {toast.title}
              </Text>
              {toast.body ? (
                <Text style={type.bodyMuted} numberOfLines={2}>
                  {toast.body}
                </Text>
              ) : null}
            </View>

            {toast.actionLabel ? (
              <View
                style={{
                  paddingHorizontal: spacing.md,
                  paddingVertical: 7,
                  borderRadius: radius.pill,
                  backgroundColor: colors.primary,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '800', color: colors.onPrimary }}>
                  {toast.actionLabel}
                </Text>
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
              hitSlop={8}
              onPress={() => dismissToast(toast.id)}
            >
              <Text style={{ fontSize: 15, color: colors.textFaint, fontWeight: '800' }}>✕</Text>
            </Pressable>
          </View>
        </GlassCard>
      </Pressable>
    </Animated.View>
  );
}

export default ToastStack;
