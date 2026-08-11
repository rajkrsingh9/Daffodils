import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  ClayButton,
  ClayCard,
  Screen,
  ScreenHeader,
} from '../../components/shared';
import { colors, spacing, type } from '../../constants/theme';
import { apiError } from '../../services/api';
import { requestNotificationPermission } from '../../services/push';
import { useAuthStore } from '../../stores/authStore';
import { useLocationStore } from '../../stores/locationStore';
import { useOnboardingStore } from '../../stores/onboardingStore';
import { api } from '../../services/api';

/** Onboarding 5/5 — permissions, then the account is actually created. */
export default function PermissionsStep() {
  const router = useRouter();
  const store = useOnboardingStore();
  const register = useAuthStore((s) => s.register);
  const requestLocation = useLocationStore((s) => s.requestPermission);
  const refreshLocation = useLocationStore((s) => s.refresh);

  const [locationGranted, setLocationGranted] = useState<boolean | null>(null);
  const [notifGranted, setNotifGranted] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      await register({
        phone: store.phone,
        phoneProofToken: store.phoneProofToken ?? undefined,
        password: store.password,
        name: store.name,
        username: store.username,
        city: store.city || undefined,
      });

      // Interests and avatar are a profile PATCH — registration only takes the
      // identity fields.
      await api
        .patch('/users/me', {
          interestTags: store.interestTags,
          ...(store.avatarUrl ? { avatarUrl: store.avatarUrl } : {}),
        })
        .catch(() => undefined);

      if (locationGranted) await refreshLocation();

      store.reset();
      router.replace('/(tabs)');
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Two last things" subtitle="Step 5 of 5" onBack />

      <View style={{ flex: 1, padding: spacing.xl, gap: spacing.lg }}>
        <PermissionCard
          emoji="📍"
          title="Location"
          body="Daffodils only works if it knows roughly where you are — intents are broadcast to people within a radius you choose."
          state={locationGranted}
          cta="Allow location"
          onPress={async () => setLocationGranted(await requestLocation())}
        />

        <PermissionCard
          emoji="🔔"
          title="Notifications"
          body="Someone raising a hand for your plan, or picking you as their companion, is time-sensitive. Without push you will miss it."
          state={notifGranted}
          cta="Allow notifications"
          onPress={async () => setNotifGranted(await requestNotificationPermission())}
        />

        <View style={{ flex: 1 }} />

        {error ? (
          <Text style={[type.caption, { color: colors.danger, textAlign: 'center' }]}>
            {error}
          </Text>
        ) : null}

        <ClayButton
          title="Create my account"
          full
          size="lg"
          loading={busy}
          onPress={finish}
        />
        <Text style={[type.caption, { textAlign: 'center' }]}>
          You can change both later in Settings.
        </Text>
      </View>
    </Screen>
  );
}

function PermissionCard({
  emoji,
  title,
  body,
  state,
  cta,
  onPress,
}: {
  emoji: string;
  title: string;
  body: string;
  state: boolean | null;
  cta: string;
  onPress: () => void;
}) {
  return (
    <ClayCard>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <Text style={{ fontSize: 28 }}>{emoji}</Text>
        <View style={{ flex: 1, gap: spacing.sm }}>
          <Text style={type.heading}>{title}</Text>
          <Text style={type.bodyMuted}>{body}</Text>
          {state === true ? (
            <Text style={{ color: colors.success, fontWeight: '800', fontSize: 13 }}>
              ✓ Allowed
            </Text>
          ) : (
            <ClayButton
              title={state === false ? 'Try again' : cta}
              variant="secondary"
              size="sm"
              onPress={onPress}
            />
          )}
          {state === false ? (
            <Text style={[type.caption, { color: colors.warning }]}>
              Denied — you can enable it in your device settings.
            </Text>
          ) : null}
        </View>
      </View>
    </ClayCard>
  );
}
