import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  Avatar,
  ClayButton,
  ClayInput,
  Screen,
  ScreenHeader,
} from '../../components/shared';
import { colors, spacing, type } from '../../constants/theme';
import { api } from '../../services/api';
import { useOnboardingStore } from '../../stores/onboardingStore';

/** Onboarding 3/5 — name, username, city, photo. */
export default function ProfileStep() {
  const router = useRouter();
  const store = useOnboardingStore();

  const [name, setName] = useState(store.name);
  const [username, setUsername] = useState(store.username);
  const [city, setCity] = useState(store.city);
  const [password, setPassword] = useState(store.password);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(store.avatarUrl);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);

  // Debounced availability check so the user learns about a clash while they
  // type, not after they submit the form.
  useEffect(() => {
    if (username.length < 3) {
      setAvailable(null);
      return;
    }
    setChecking(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.get('/users/username-available', { params: { username } });
        setAvailable(res.data.data.available);
      } catch {
        setAvailable(null);
      } finally {
        setChecking(false);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [username]);

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) setAvatarUrl(result.assets[0].uri);
  };

  const passwordOk =
    password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password);
  const canContinue =
    name.trim().length > 0 && username.length >= 3 && available !== false && passwordOk;

  const next = () => {
    store.set({ name: name.trim(), username, city: city.trim(), password, avatarUrl });
    router.push('/onboarding/interests');
  };

  return (
    <Screen>
      <ScreenHeader title="Build your profile" subtitle="Step 3 of 5" onBack />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl * 2 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ alignItems: 'center', gap: spacing.sm }}>
            <Pressable onPress={pickPhoto} accessibilityRole="button" accessibilityLabel="Choose a profile photo">
              <Avatar uri={avatarUrl} name={name || '?'} size={104} />
            </Pressable>
            <Text style={[type.caption, { color: colors.primaryDeep, fontWeight: '800' }]}>
              {avatarUrl ? 'Change photo' : 'Add a photo'}
            </Text>
          </View>

          <ClayInput
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="What should people call you?"
            maxLength={60}
          />

          <ClayInput
            label="Username"
            value={username}
            onChangeText={(t) => setUsername(t.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())}
            placeholder="raj_k"
            autoCapitalize="none"
            maxLength={24}
            error={available === false ? 'That username is taken' : null}
            hint={
              checking
                ? 'Checking…'
                : available === true
                  ? '✓ Available'
                  : 'Letters, numbers and underscores'
            }
          />

          <ClayInput
            label="City"
            value={city}
            onChangeText={setCity}
            placeholder="Kolkata"
            maxLength={80}
          />

          <ClayInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
            secureTextEntry
            hint={
              passwordOk
                ? '✓ Strong enough'
                : 'Needs 8+ characters with an uppercase letter and a number'
            }
          />

          <ClayButton
            title="Continue"
            full
            size="lg"
            disabled={!canContinue}
            onPress={next}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
