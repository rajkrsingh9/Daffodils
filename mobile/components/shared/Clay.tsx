import React, { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { clayEdge, colors, radius, shadows, spacing, type } from '../../constants/theme';

/**
 * Claymorphism primitives.
 *
 * Every raised element is the same recipe: big radius + warm drop shadow +
 * a light top edge. Keeping that in one place is what stops the app drifting
 * into "rounded rectangles with a box-shadow".
 */

// ─────────────────────────────────────────────────────────────── surface ──

interface ClayCardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: 'surface' | 'sunken' | 'primary' | 'transparent';
  depth?: 'sm' | 'md' | 'lg' | 'none';
  radiusKey?: keyof typeof radius;
}

export function ClayCard({
  children,
  style,
  tone = 'surface',
  depth = 'md',
  radiusKey = 'lg',
}: ClayCardProps) {
  const toneStyle: ViewStyle =
    tone === 'sunken'
      ? { backgroundColor: colors.surfaceSunken }
      : tone === 'primary'
        ? { backgroundColor: colors.primarySoft }
        : tone === 'transparent'
          ? { backgroundColor: 'transparent' }
          : { backgroundColor: colors.surface };

  const depthStyle =
    depth === 'none'
      ? undefined
      : depth === 'sm'
        ? shadows.claySm
        : depth === 'lg'
          ? shadows.clayLg
          : shadows.clay;

  return (
    <View
      style={[
        { borderRadius: radius[radiusKey], padding: spacing.lg },
        toneStyle,
        depthStyle,
        tone !== 'transparent' && clayEdge,
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ──────────────────────────────────────────────────────────────── button ──

interface ClayButtonProps extends Omit<PressableProps, 'style'> {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export function ClayButton({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  full,
  disabled,
  style,
  textStyle,
  ...rest
}: ClayButtonProps) {
  const isDisabled = disabled || loading;

  const palette: Record<string, { bg: string; fg: string; shadow: ViewStyle }> = {
    primary: { bg: colors.primary, fg: colors.onPrimary, shadow: shadows.primary },
    secondary: { bg: colors.surface, fg: colors.text, shadow: shadows.clay },
    ghost: { bg: 'transparent', fg: colors.textMuted, shadow: {} },
    danger: { bg: colors.danger, fg: colors.onDark, shadow: shadows.clay },
  };
  const p = palette[variant];

  const heights = { sm: 40, md: 52, lg: 60 };
  const fontSizes = { sm: 14, md: 16, lg: 17 };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(isDisabled), busy: Boolean(loading) }}
      onPress={() => {
        if (isDisabled) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
        onPress?.();
      }}
      disabled={isDisabled}
      style={({ pressed }) => [
        {
          height: heights[size],
          minWidth: full ? '100%' : undefined,
          alignSelf: full ? 'stretch' : 'flex-start',
          paddingHorizontal: size === 'sm' ? spacing.lg : spacing.xl,
          borderRadius: radius.pill,
          backgroundColor: p.bg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
          opacity: isDisabled ? 0.5 : 1,
          // Pressing sinks the clay into the surface.
          transform: [{ translateY: pressed ? 2 : 0 }],
        },
        variant !== 'ghost' && (pressed ? shadows.clayPressed : p.shadow),
        variant !== 'ghost' && clayEdge,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} size="small" />
      ) : (
        <>
          {icon}
          <Text style={[type.button, { color: p.fg, fontSize: fontSizes[size] }, textStyle]}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

// ───────────────────────────────────────────────────────────────── input ──

interface ClayInputProps extends TextInputProps {
  label?: string;
  error?: string | null;
  hint?: string;
  counter?: { value: number; max: number };
  containerStyle?: StyleProp<ViewStyle>;
}

export function ClayInput({
  label,
  error,
  hint,
  counter,
  containerStyle,
  style,
  ...rest
}: ClayInputProps) {
  const [focused, setFocused] = React.useState(false);

  return (
    <View style={[{ gap: spacing.sm }, containerStyle]}>
      {(label || counter) && (
        <View style={styles.row}>
          {label ? <Text style={type.label}>{label.toUpperCase()}</Text> : <View />}
          {counter && (
            <Text
              style={[
                type.caption,
                counter.value > counter.max && { color: colors.danger },
              ]}
            >
              {counter.value}/{counter.max}
            </Text>
          )}
        </View>
      )}

      {/* Inputs read as *pressed into* the clay — the inverse of a button. */}
      <View
        style={[
          {
            backgroundColor: colors.surfaceSunken,
            borderRadius: radius.md,
            borderWidth: 1.5,
            borderColor: error
              ? colors.danger
              : focused
                ? colors.primary
                : colors.border,
            paddingHorizontal: spacing.lg,
            paddingVertical: rest.multiline ? spacing.md : 0,
            minHeight: rest.multiline ? 96 : 52,
            justifyContent: 'center',
          },
        ]}
      >
        <TextInput
          placeholderTextColor={colors.textFaint}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[
            type.body,
            {
              padding: 0,
              textAlignVertical: rest.multiline ? 'top' : 'center',
              minHeight: rest.multiline ? 72 : undefined,
            },
            style,
          ]}
          {...rest}
        />
      </View>

      {(error || hint) && (
        <Text style={[type.caption, error ? { color: colors.danger } : undefined]}>
          {error ?? hint}
        </Text>
      )}
    </View>
  );
}

// ────────────────────────────────────────────────────────────────── chip ──

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  color?: string;
  softColor?: string;
  emoji?: string;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
}

export function Chip({
  label,
  selected,
  onPress,
  color = colors.primaryDeep,
  softColor = colors.primarySoft,
  emoji,
  size = 'md',
  style,
}: ChipProps) {
  const content = (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: size === 'sm' ? spacing.md : spacing.lg,
          paddingVertical: size === 'sm' ? 6 : 10,
          borderRadius: radius.pill,
          backgroundColor: selected ? softColor : colors.surface,
          borderWidth: 1.5,
          borderColor: selected ? color : colors.borderSoft,
        },
        selected ? shadows.claySm : undefined,
        style,
      ]}
    >
      {emoji && <Text style={{ fontSize: size === 'sm' ? 12 : 14 }}>{emoji}</Text>}
      <Text
        style={{
          fontSize: size === 'sm' ? 12 : 14,
          fontWeight: '700',
          color: selected ? color : colors.textMuted,
        }}
      >
        {label}
      </Text>
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={() => {
        Haptics.selectionAsync().catch(() => undefined);
        onPress();
      }}
    >
      {content}
    </Pressable>
  );
}

// ───────────────────────────────────────────────────────────── utilities ──

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[
        { height: 1, backgroundColor: colors.borderSoft, marginVertical: spacing.md },
        style,
      ]}
    />
  );
}

export function SectionTitle({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <View style={[styles.row, { marginBottom: spacing.md }]}>
      <View style={{ flex: 1 }}>
        <Text style={type.heading}>{title}</Text>
        {subtitle ? <Text style={[type.caption, { marginTop: 2 }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function EmptyState({
  emoji,
  title,
  body,
  action,
}: {
  emoji: string;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: spacing.xxl * 1.5, gap: spacing.md }}>
      <View
        style={[
          {
            width: 88,
            height: 88,
            borderRadius: radius.xl,
            backgroundColor: colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
          },
          shadows.clay,
          clayEdge,
        ]}
      >
        <Text style={{ fontSize: 38 }}>{emoji}</Text>
      </View>
      <Text style={[type.heading, { textAlign: 'center' }]}>{title}</Text>
      {body ? (
        <Text style={[type.bodyMuted, { textAlign: 'center', paddingHorizontal: spacing.xl }]}>
          {body}
        </Text>
      ) : null}
      {action}
    </View>
  );
}

export function Badge({
  label,
  color = colors.primaryDeep,
  soft = colors.primarySoft,
  dot,
}: {
  label: string;
  color?: string;
  soft?: string;
  dot?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: radius.pill,
        backgroundColor: soft,
      }}
    >
      {dot && (
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
      )}
      <Text style={{ fontSize: 11, fontWeight: '800', color, letterSpacing: 0.2 }}>
        {label}
      </Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
