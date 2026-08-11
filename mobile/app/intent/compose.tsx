import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  Chip,
  ClayButton,
  ClayCard,
  ClayInput,
  Screen,
  ScreenHeader,
  SectionTitle,
  formatWhen,
} from '../../components/shared';
import { IntentCard } from '../../components/intent/IntentCard';
import { ACTIVITY_EMOJIS, config } from '../../constants/config';
import { colors, radius, spacing, type, vibe as vibes, VibeKey } from '../../constants/theme';
import { api, apiError, unwrap } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { useLocationStore } from '../../stores/locationStore';

const VIBE_KEYS = Object.keys(vibes) as VibeKey[];
const EXPIRY_PRESETS = [
  { label: '1h', hours: 1 },
  { label: '3h', hours: 3 },
  { label: '6h', hours: 6 },
] as const;

export default function IntentCompose() {
  const router = useRouter();
  const params = useLocalSearchParams<{ fromPostId?: string; title?: string }>();
  const user = useAuthStore((s) => s.user);
  const coords = useLocationStore((s) => s.coords);
  const refreshLocation = useLocationStore((s) => s.refresh);

  const [title, setTitle] = useState(params.title?.slice(0, 120) ?? '');
  const [description, setDescription] = useState('');
  const [emoji, setEmoji] = useState('☕️');
  const [locationName, setLocationName] = useState('');
  const [scheduledAt, setScheduledAt] = useState(() => new Date(Date.now() + 3 * 3600_000));
  const [showPicker, setShowPicker] = useState<'date' | 'time' | null>(null);
  const [groupSize, setGroupSize] = useState(1);
  const [vibeTag, setVibeTag] = useState<VibeKey>('CASUAL');
  const [radiusKm, setRadiusKm] = useState<number>(config.defaultRadiusKm);
  const [expiryHours, setExpiryHours] = useState<number>(3);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * The server rejects an expiry past the start time — an intent that is still
   * collecting hands after the activity has begun helps nobody. Clamp here so
   * the user sees the real window before they submit.
   */
  const expiresAt = useMemo(() => {
    const requested = new Date(Date.now() + expiryHours * 3600_000);
    return requested > scheduledAt ? scheduledAt : requested;
  }, [expiryHours, scheduledAt]);

  const canSubmit =
    title.trim().length >= 3 && locationName.trim().length >= 2 && scheduledAt > new Date();

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const location = coords ?? (await refreshLocation());
      if (!location) throw new Error('Location is required to broadcast an intent');

      const created = await unwrap<{ id: string; broadcast: { notified: number } }>(
        api.post('/intents', {
          title: title.trim(),
          description: description.trim() || null,
          activityEmoji: emoji,
          locationName: locationName.trim(),
          lat: location.lat,
          lng: location.lng,
          scheduledAt: scheduledAt.toISOString(),
          groupSize,
          vibeTag,
          radiusKm,
          expiresAt: expiresAt.toISOString(),
          ...(params.fromPostId ? { fromPostId: params.fromPostId } : {}),
        })
      );

      router.replace(`/intent/dashboard/${created.id}`);
    } catch (err) {
      setError(apiError(err));
      setPreview(false);
    } finally {
      setBusy(false);
    }
  };

  // ── preview ──────────────────────────────────────────────────────────
  if (preview) {
    return (
      <Screen edges={['top', 'bottom']}>
        <ScreenHeader
          title="Preview"
          subtitle={`Broadcasting to everyone within ${radiusKm} km`}
          onBack={() => setPreview(false)}
        />
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
          <IntentCard
            intent={{
              id: 'preview',
              title: title.trim(),
              description: description.trim() || null,
              activityEmoji: emoji,
              locationName: locationName.trim(),
              lat: coords?.lat ?? 0,
              lng: coords?.lng ?? 0,
              scheduledAt: scheduledAt.toISOString(),
              groupSize,
              filledSlots: 0,
              vibeTag,
              radiusKm,
              expiresAt: expiresAt.toISOString(),
              status: 'ACTIVE',
              creator: user
                ? {
                    id: user.id,
                    name: user.name,
                    username: user.username,
                    avatarUrl: user.avatarUrl,
                    trustTier: user.trustTier,
                    trustScore: user.trustScore,
                  }
                : undefined,
            }}
            onPress={() => undefined}
          />

          <ClayCard tone="sunken" depth="none">
            <Text style={type.label}>WHAT HAPPENS NEXT</Text>
            <Text style={[type.bodyMuted, { marginTop: spacing.sm }]}>
              Everyone active within {radiusKm} km gets a notification. Interested people raise
              a hand, and you choose who joins. They then confirm before a chat opens — nobody
              is matched without both of you agreeing.
            </Text>
            <Text style={[type.caption, { marginTop: spacing.sm }]}>
              Stops accepting hands at {formatWhen(expiresAt)}.
            </Text>
          </ClayCard>

          {error ? (
            <Text style={[type.caption, { color: colors.danger, textAlign: 'center' }]}>
              {error}
            </Text>
          ) : null}

          <ClayButton title="Publish intent" full size="lg" loading={busy} onPress={submit} />
          <ClayButton title="Keep editing" variant="ghost" full onPress={() => setPreview(false)} />
        </ScrollView>
      </Screen>
    );
  }

  // ── compose ──────────────────────────────────────────────────────────
  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader
        title="New intent"
        subtitle={params.fromPostId ? 'From your wishlist post' : 'Who’s in?'}
        onBack
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl }}
          keyboardShouldPersistTaps="handled"
        >
          {/* activity */}
          <View style={{ gap: spacing.sm }}>
            <Text style={type.label}>ACTIVITY</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {ACTIVITY_EMOJIS.map((e) => (
                  <Pressable
                    key={e}
                    onPress={() => setEmoji(e)}
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: radius.md,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: emoji === e ? colors.primarySoft : colors.surface,
                      borderWidth: 1.5,
                      borderColor: emoji === e ? colors.primary : colors.borderSoft,
                    }}
                  >
                    <Text style={{ fontSize: 21 }}>{e}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>

          <ClayInput
            label="Title"
            value={title}
            onChangeText={setTitle}
            placeholder="Coffee at Flurys"
            maxLength={120}
          />

          <ClayInput
            label="Description (optional)"
            value={description}
            onChangeText={setDescription}
            placeholder="Filter coffee and people-watching on Park Street."
            multiline
            maxLength={500}
          />

          <ClayInput
            label="Where"
            value={locationName}
            onChangeText={setLocationName}
            placeholder="Flurys, Park Street"
            maxLength={160}
            hint={
              coords
                ? 'Broadcast is centred on your current location'
                : 'Enable location so this can be broadcast'
            }
          />

          {/* when */}
          <View style={{ gap: spacing.sm }}>
            <Text style={type.label}>WHEN</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <PickerButton label={scheduledAt.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} onPress={() => setShowPicker('date')} />
              <PickerButton label={scheduledAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} onPress={() => setShowPicker('time')} />
            </View>
            <Text style={type.caption}>{formatWhen(scheduledAt)}</Text>

            {showPicker ? (
              <DateTimePicker
                value={scheduledAt}
                mode={showPicker}
                minimumDate={new Date()}
                onChange={(_, date) => {
                  setShowPicker(Platform.OS === 'ios' ? showPicker : null);
                  if (date) setScheduledAt(date);
                  if (Platform.OS === 'ios') setShowPicker(null);
                }}
              />
            ) : null}
          </View>

          {/* group size */}
          <View style={{ gap: spacing.sm }}>
            <Text style={type.label}>HOW MANY COMPANIONS</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
              <Stepper
                value={groupSize}
                min={1}
                max={6}
                onChange={setGroupSize}
              />
              <Text style={type.bodyMuted}>
                {groupSize === 1 ? 'Just one person' : `${groupSize} people`}
              </Text>
            </View>
          </View>

          {/* vibe */}
          <View style={{ gap: spacing.sm }}>
            <Text style={type.label}>VIBE</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {VIBE_KEYS.map((key) => (
                <Chip
                  key={key}
                  label={vibes[key].label}
                  emoji={vibes[key].emoji}
                  color={vibes[key].color}
                  softColor={vibes[key].soft}
                  selected={vibeTag === key}
                  onPress={() => setVibeTag(key)}
                />
              ))}
            </View>
          </View>

          {/* radius */}
          <View style={{ gap: spacing.sm }}>
            <SectionTitle
              title="Broadcast radius"
              subtitle="Who gets notified"
              right={
                <Text style={[type.heading, { color: colors.primaryDeep }]}>{radiusKm} km</Text>
              }
            />
            <RadiusSlider value={radiusKm} onChange={setRadiusKm} />
          </View>

          {/* expiry */}
          <View style={{ gap: spacing.sm }}>
            <Text style={type.label}>STOPS ACCEPTING HANDS IN</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {EXPIRY_PRESETS.map((p) => (
                <Chip
                  key={p.label}
                  label={p.label}
                  selected={expiryHours === p.hours}
                  onPress={() => setExpiryHours(p.hours)}
                />
              ))}
              <Chip
                label="Until start"
                selected={expiryHours === 999}
                onPress={() => setExpiryHours(999)}
              />
            </View>
            <Text style={type.caption}>Closes {formatWhen(expiresAt)}</Text>
          </View>

          {error ? (
            <Text style={[type.caption, { color: colors.danger }]}>{error}</Text>
          ) : null}

          <ClayButton
            title="Preview"
            full
            size="lg"
            disabled={!canSubmit}
            onPress={() => setPreview(true)}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function PickerButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        height: 52,
        borderRadius: radius.md,
        backgroundColor: colors.surfaceSunken,
        borderWidth: 1.5,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={[type.body, { fontWeight: '700' }]}>{label}</Text>
    </Pressable>
  );
}

function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const btn = (label: string, delta: number, disabled: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={delta > 0 ? 'Increase' : 'Decrease'}
      disabled={disabled}
      onPress={() => onChange(value + delta)}
      style={{
        width: 42,
        height: 42,
        borderRadius: radius.sm,
        backgroundColor: disabled ? colors.surfaceSunken : colors.primarySoft,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.primaryDeep }}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      {btn('−', -1, value <= min)}
      <Text style={[type.title, { minWidth: 26, textAlign: 'center' }]}>{value}</Text>
      {btn('+', 1, value >= max)}
    </View>
  );
}

/**
 * Discrete radius picker. A continuous slider is fiddly on a phone and the
 * broadcast radius only meaningfully changes in steps anyway.
 */
function RadiusSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const steps = [1, 2, 3, 5, 8, 10, 15, 20];

  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {steps.map((km) => {
        const active = value === km;
        return (
          <Pressable
            key={km}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(km)}
            style={{
              flex: 1,
              paddingVertical: 12,
              borderRadius: radius.sm,
              alignItems: 'center',
              backgroundColor: active ? colors.primary : colors.surfaceSunken,
              borderWidth: 1.5,
              borderColor: active ? colors.primaryDeep : colors.border,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: '800',
                color: active ? colors.onPrimary : colors.textMuted,
              }}
            >
              {km}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
