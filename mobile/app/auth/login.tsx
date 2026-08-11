import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ClayButton, ClayInput, Screen, ScreenHeader } from '../../components/shared';
import { colors, spacing, type } from '../../constants/theme';
import { apiError } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';

export default function Login() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await login(identifier.trim(), password);
      router.replace('/(tabs)');
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Welcome back" onBack />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
            <Text style={{ fontSize: 52 }}>🌼</Text>
          </View>

          <ClayInput
            label="Phone, email or username"
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="+91 98765 43210"
          />

          <ClayInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Your password"
            error={error}
          />

          <ClayButton
            title="Sign in"
            full
            size="lg"
            loading={busy}
            disabled={!identifier || !password}
            onPress={submit}
          />

          <ClayButton
            title="Create a new account"
            variant="ghost"
            full
            onPress={() => router.replace('/onboarding/welcome')}
          />

          <Text style={[type.caption, { textAlign: 'center', color: colors.textFaint }]}>
            Signing in registers this device for match and chat alerts.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
