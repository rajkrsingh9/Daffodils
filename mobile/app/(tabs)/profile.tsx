import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ClayButton, Screen } from '../../components/shared';
import { ProfileView, type Profile } from '../../components/profile/ProfileView';
import { clayEdge, colors, radius, shadows, spacing, type } from '../../constants/theme';
import { api, unwrap } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';

export default function ProfileTab() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const [profile, setProfile] = useState<Profile | null>(null);

  useFocusEffect(
    useCallback(() => {
      void refreshUser();
      if (user?.username) {
        unwrap<Profile>(api.get(`/users/${user.username}`))
          .then(setProfile)
          .catch(() => undefined);
      }
    }, [user?.username, refreshUser])
  );

  const merged: Profile | null = profile
    ? { ...profile, postCount: profile.postCount ?? user?.postCount }
    : user
      ? ({ ...user, isSelf: true } as unknown as Profile)
      : null;

  if (!merged) {
    return (
      <Screen>
        <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.primaryDeep} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ProfileView
        profile={merged}
        isSelf
        header={
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
              paddingHorizontal: spacing.lg,
              paddingBottom: spacing.md,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={[type.caption, { marginBottom: 2 }]}>Your profile is public</Text>
              <Text style={type.display}>You</Text>
            </View>

            <IconButton label="Edit profile" icon="✎" onPress={() => router.push('/settings/edit-profile')} />
            <IconButton label="Settings" icon="⚙" onPress={() => router.push('/settings')} />
          </View>
        }
      />

      {!user?.faceVerified ? (
        <View
          style={{
            position: 'absolute',
            left: spacing.lg,
            right: spacing.lg,
            bottom: spacing.lg,
          }}
        >
          <ClayButton
            title="Verify your face to unlock intents"
            full
            onPress={() => router.push('/face/enroll?mode=enroll')}
          />
        </View>
      ) : null}
    </Screen>
  );
}

function IconButton({
  icon,
  label,
  onPress,
}: {
  icon: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[
        {
          width: 44,
          height: 44,
          borderRadius: radius.md,
          backgroundColor: colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
        },
        shadows.claySm,
        clayEdge,
      ]}
    >
      <Text style={{ fontSize: 17 }}>{icon}</Text>
    </Pressable>
  );
}
