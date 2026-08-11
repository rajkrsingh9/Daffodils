import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { EmptyState, Screen, ScreenHeader } from '../../components/shared';
import { ProfileView, type Profile } from '../../components/profile/ProfileView';
import { clayEdge, colors, radius, shadows, spacing } from '../../constants/theme';
import { api, apiError, unwrap } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';

export default function ViewedProfile() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const router = useRouter();
  const me = useAuthStore((s) => s.user);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!username) return;
      unwrap<Profile>(api.get(`/users/${username}`))
        .then(setProfile)
        .catch((err) => setError(apiError(err)));
    }, [username])
  );

  const isSelf = profile?.id === me?.id;

  const openMenu = () => {
    Alert.alert(profile?.name ?? 'Options', undefined, [
      {
        text: 'Report user',
        style: 'destructive',
        onPress: () =>
          Alert.prompt?.('Report', 'What is the problem?', async (reason) => {
            if (!reason) return;
            await api
              .post('/users/report', { username, reason })
              .then(() => Alert.alert('Reported', 'Thanks — our team will review this.'))
              .catch((err) => Alert.alert('Could not report', apiError(err)));
          }) ??
          api
            .post('/users/report', { username, reason: 'Reported from profile' })
            .then(() => Alert.alert('Reported', 'Thanks — our team will review this.'))
            .catch((err) => Alert.alert('Could not report', apiError(err))),
      },
      {
        text: 'Block user',
        style: 'destructive',
        onPress: () =>
          Alert.alert(
            `Block ${profile?.name}?`,
            'You will stop seeing their posts and intents, and they will stop seeing yours.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Block',
                style: 'destructive',
                onPress: async () => {
                  await api.post(`/users/${username}/block`).catch(() => undefined);
                  router.back();
                },
              },
            ]
          ),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  if (error) {
    return (
      <Screen>
        <ScreenHeader title="Profile" onBack />
        <EmptyState emoji="🚫" title="Profile unavailable" body={error} />
      </Screen>
    );
  }

  if (!profile) {
    return (
      <Screen>
        <ScreenHeader title="Profile" onBack />
        <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.primaryDeep} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ProfileView
        profile={profile}
        isSelf={Boolean(isSelf)}
        header={
          <ScreenHeader
            title={profile.name}
            subtitle={`@${profile.username}`}
            onBack
            right={
              isSelf ? undefined : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="More options"
                  onPress={openMenu}
                  style={[
                    {
                      width: 40,
                      height: 40,
                      borderRadius: radius.md,
                      backgroundColor: colors.surface,
                      alignItems: 'center',
                      justifyContent: 'center',
                    },
                    shadows.claySm,
                    clayEdge,
                  ]}
                >
                  <Text style={{ fontSize: 18, color: colors.textMuted }}>⋮</Text>
                </Pressable>
              )
            }
          />
        }
      />
    </Screen>
  );
}
