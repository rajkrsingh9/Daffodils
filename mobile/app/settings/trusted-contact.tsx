import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import { useRouter } from 'expo-router';
import {
  ClayButton,
  ClayCard,
  ClayInput,
  Screen,
  ScreenHeader,
} from '../../components/shared';
import { colors, spacing, type } from '../../constants/theme';
import { api, apiError, unwrap } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';

export default function TrustedContact() {
  const router = useRouter();
  const refreshUser = useAuthStore((s) => s.refreshUser);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+91');
  const [relation, setRelation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState(false);

  useEffect(() => {
    unwrap<{ name: string; phone: string; relation: string | null } | null>(
      api.get('/safety/trusted-contact')
    )
      .then((c) => {
        if (!c) return;
        setName(c.name);
        setPhone(c.phone);
        setRelation(c.relation ?? '');
        setExisting(true);
      })
      .catch(() => undefined);
  }, []);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.put('/safety/trusted-contact', {
        name: name.trim(),
        phone: phone.trim(),
        relation: relation.trim() || null,
      });
      await refreshUser();
      router.back();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    Alert.alert('Remove trusted contact?', 'An SOS would then reach nobody.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await api.delete('/safety/trusted-contact').catch(() => undefined);
          await refreshUser();
          router.back();
        },
      },
    ]);

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader title="Trusted contact" subtitle="Who we alert on SOS" onBack />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
          <ClayCard tone="sunken" depth="none">
            <Text style={type.label}>WHAT HAPPENS ON SOS</Text>
            <Text style={[type.bodyMuted, { marginTop: spacing.sm }]}>
              Holding the SOS button immediately texts this person your live coordinates and a
              map link. If they also use Daffodils they get a push at the same time, and your
              companion is told that help was called.
            </Text>
          </ClayCard>

          <ClayInput
            label="Their name"
            value={name}
            onChangeText={setName}
            placeholder="Ma"
            maxLength={60}
          />

          <ClayInput
            label="Phone number"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="+91 98765 43210"
            hint="Include the country code — this is where the SMS goes"
          />

          <ClayInput
            label="Relationship (optional)"
            value={relation}
            onChangeText={setRelation}
            placeholder="Mother, flatmate, friend…"
            maxLength={40}
            error={error}
          />

          <ClayButton
            title="Save contact"
            full
            size="lg"
            loading={busy}
            disabled={!name.trim() || phone.replace(/\D/g, '').length < 8}
            onPress={save}
          />

          {existing ? (
            <ClayButton title="Remove contact" variant="ghost" full onPress={remove} />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
