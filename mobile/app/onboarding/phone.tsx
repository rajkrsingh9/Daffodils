import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
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
import { useOnboardingStore } from '../../stores/onboardingStore';

/** Onboarding 2/5 — phone number → OTP verify. */
export default function PhoneStep() {
  const router = useRouter();
  const store = useOnboardingStore();

  const [phone, setPhone] = useState(store.phone || '+91');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'phone' | 'code'>('phone');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendOtp = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await unwrap<{ sent: boolean; devCode?: string }>(
        api.post('/auth/otp/send', { phone })
      );
      setDevCode(data.devCode ?? null);
      setStage('code');
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    setBusy(true);
    setError(null);
    try {
      // Signed out, this returns a short-lived proof token that the register
      // call redeems — the account does not exist yet at this point.
      const data = await unwrap<{ phoneProofToken: string }>(
        api.post('/auth/otp/verify', { phone, code })
      );
      store.set({ phone, phoneProofToken: data.phoneProofToken });
      router.push('/onboarding/profile');
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader
        title={stage === 'phone' ? 'Your number' : 'Enter the code'}
        subtitle="Step 2 of 5"
        onBack
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: spacing.xl, gap: spacing.xl }}
          keyboardShouldPersistTaps="handled"
        >
          {stage === 'phone' ? (
            <>
              <Text style={type.bodyMuted}>
                We verify every number so the people you meet are reachable. It is never
                shown on your profile.
              </Text>
              <ClayInput
                label="Phone number"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="+91 98765 43210"
                autoFocus
                error={error}
                hint="Include your country code"
              />
              <ClayButton
                title="Send code"
                full
                size="lg"
                loading={busy}
                disabled={phone.replace(/\D/g, '').length < 8}
                onPress={sendOtp}
              />
            </>
          ) : (
            <>
              <Text style={type.bodyMuted}>
                We sent a 6-digit code to <Text style={{ color: colors.text }}>{phone}</Text>.
                It expires in 10 minutes.
              </Text>

              {devCode ? (
                <ClayCard tone="primary" depth="sm">
                  <Text style={type.label}>DEVELOPMENT MODE</Text>
                  <Text style={[type.title, { letterSpacing: 6, marginTop: 4 }]}>
                    {devCode}
                  </Text>
                  <Text style={[type.caption, { marginTop: 4 }]}>
                    Shown because no SMS gateway is configured.
                  </Text>
                </ClayCard>
              ) : null}

              <ClayInput
                label="6-digit code"
                value={code}
                onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                placeholder="000000"
                autoFocus
                maxLength={6}
                error={error}
                style={{ fontSize: 24, letterSpacing: 8, fontWeight: '800' }}
              />

              <View style={{ gap: spacing.md }}>
                <ClayButton
                  title="Verify"
                  full
                  size="lg"
                  loading={busy}
                  disabled={code.length !== 6}
                  onPress={verifyOtp}
                />
                <ClayButton
                  title="Change number"
                  variant="ghost"
                  full
                  onPress={() => {
                    setStage('phone');
                    setCode('');
                    setError(null);
                  }}
                />
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
