import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  Avatar,
  Chip,
  ClayButton,
  ClayInput,
  Screen,
  ScreenHeader,
  SectionTitle,
} from '../../components/shared';
import { INTEREST_OPTIONS, config } from '../../constants/config';
import { colors, spacing, type } from '../../constants/theme';
import { api, apiError } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';

export default function EditProfile() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const refreshUser = useAuthStore((s) => s.refreshUser);

  const [name, setName] = useState(user?.name ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [city, setCity] = useState(user?.city ?? '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl ?? null);
  const [tags, setTags] = useState<string[]>(user?.interestTags ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.patch('/users/me', {
        name: name.trim(),
        bio: bio.trim() || null,
        city: city.trim() || null,
        interestTags: tags,
        // Only send an avatar the server can actually fetch.
        ...(avatarUrl && /^https?:\/\//.test(avatarUrl) ? { avatarUrl } : {}),
      });
      await refreshUser();
      router.back();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader title="Edit profile" onBack />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ alignItems: 'center', gap: spacing.sm }}>
            <Pressable onPress={pickPhoto} accessibilityRole="button" accessibilityLabel="Change photo">
              <Avatar uri={avatarUrl} name={name} size={96} />
            </Pressable>
            <Text style={[type.caption, { color: colors.primaryDeep, fontWeight: '800' }]}>
              Change photo
            </Text>
          </View>

          <ClayInput label="Name" value={name} onChangeText={setName} maxLength={60} />

          <ClayInput
            label="Bio"
            value={bio}
            onChangeText={setBio}
            placeholder="A line or two about you"
            multiline
            maxLength={300}
            counter={{ value: bio.length, max: 300 }}
          />

          <ClayInput label="City" value={city} onChangeText={setCity} maxLength={80} />

          <View>
            <SectionTitle
              title="Interests"
              subtitle={`${tags.length} selected · minimum ${config.minInterestTags}`}
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {INTEREST_OPTIONS.map((tag) => (
                <Chip
                  key={tag}
                  label={tag}
                  selected={tags.includes(tag)}
                  onPress={() =>
                    setTags((prev) =>
                      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                    )
                  }
                />
              ))}
            </View>
          </View>

          {error ? <Text style={[type.caption, { color: colors.danger }]}>{error}</Text> : null}

          <ClayButton
            title="Save changes"
            full
            size="lg"
            loading={busy}
            disabled={!name.trim() || tags.length < config.minInterestTags}
            onPress={save}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
