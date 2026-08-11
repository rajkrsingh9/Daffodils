import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  Badge,
  ClayButton,
  ClayCard,
  Screen,
  ScreenHeader,
  SectionTitle,
  TrustBadge,
} from '../../components/shared';
import { colors, radius, spacing, type } from '../../constants/theme';
import { api, apiError, unwrap } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';

interface FaceStatus {
  faceVerified: boolean;
  enrolled: boolean;
  provider: string;
  enrolledAt: string | null;
}

export default function Settings() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const refreshUser = useAuthStore((s) => s.refreshUser);

  const [face, setFace] = useState<FaceStatus | null>(null);
  const [blocked, setBlocked] = useState<{ id: string; name: string; username: string }[]>([]);

  useFocusEffect(
    useCallback(() => {
      unwrap<FaceStatus>(api.get('/face/status')).then(setFace).catch(() => undefined);
      unwrap<{ id: string; name: string; username: string }[]>(api.get('/users/me/blocks'))
        .then(setBlocked)
        .catch(() => undefined);
    }, [])
  );

  const revokeFace = () =>
    Alert.alert(
      'Remove face record?',
      'You will not be able to create or join intents until you enrol again.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete('/face/record');
              await refreshUser();
              setFace((f) => (f ? { ...f, faceVerified: false, enrolled: false } : f));
            } catch (err) {
              Alert.alert('Could not remove', apiError(err));
            }
          },
        },
      ]
    );

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader title="Settings" onBack />

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl }}
      >
        {/* account */}
        <ClayCard style={{ gap: spacing.sm }}>
          <SectionTitle title="Account" />
          <Row label="Name" value={user?.name ?? '—'} />
          <Row label="Username" value={`@${user?.username ?? ''}`} />
          <Row label="Phone" value={user?.phone ?? 'Not set'} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={type.caption}>Trust tier</Text>
            <TrustBadge tier={user?.trustTier ?? 'TIER_1'} score={user?.trustScore} />
          </View>
          <ClayButton
            title="Edit profile"
            variant="secondary"
            size="sm"
            style={{ marginTop: spacing.sm }}
            onPress={() => router.push('/settings/edit-profile')}
          />
        </ClayCard>

        {/* face verification */}
        <ClayCard style={{ gap: spacing.md }}>
          <SectionTitle
            title="Face verification"
            subtitle="Required to create or join intents"
            right={
              <Badge
                label={face?.faceVerified ? 'VERIFIED' : 'NOT VERIFIED'}
                color={face?.faceVerified ? colors.success : colors.warning}
                soft={face?.faceVerified ? colors.mintSoft : colors.primarySoft}
                dot
              />
            }
          />

          <Text style={type.bodyMuted}>
            Your selfie is reduced to a numeric signature on your phone. The image itself is
            never uploaded — only the vector, which cannot be turned back into a photo.
          </Text>

          {face?.enrolled ? (
            <>
              <Text style={type.caption}>
                Enrolled{' '}
                {face.enrolledAt
                  ? new Date(face.enrolledAt).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })
                  : ''}{' '}
                · provider: {face.provider}
              </Text>
              <ClayButton
                title="Re-verify now"
                variant="secondary"
                size="sm"
                onPress={() => router.push('/face/enroll?mode=verify')}
              />
              <ClayButton title="Remove face record" variant="ghost" size="sm" onPress={revokeFace} />
            </>
          ) : (
            <ClayButton
              title="Verify my face"
              onPress={() => router.push('/face/enroll?mode=enroll')}
            />
          )}
        </ClayCard>

        {/* safety */}
        <ClayCard style={{ gap: spacing.md }}>
          <SectionTitle title="Safety" subtitle="Who we alert if you press SOS" />
          {user?.trustedContact ? (
            <View style={{ gap: 4 }}>
              <Text style={[type.body, { fontWeight: '700' }]}>{user.trustedContact.name}</Text>
              <Text style={type.caption}>
                {user.trustedContact.phone}
                {user.trustedContact.relation ? ` · ${user.trustedContact.relation}` : ''}
              </Text>
            </View>
          ) : (
            <Text style={[type.bodyMuted, { color: colors.warning }]}>
              No trusted contact set — an SOS would be logged but reach nobody.
            </Text>
          )}
          <ClayButton
            title={user?.trustedContact ? 'Change trusted contact' : 'Add a trusted contact'}
            variant="secondary"
            size="sm"
            onPress={() => router.push('/settings/trusted-contact')}
          />
        </ClayCard>

        {/* blocked */}
        <ClayCard style={{ gap: spacing.md }}>
          <SectionTitle title="Blocked" subtitle={`${blocked.length} blocked`} />
          {blocked.length === 0 ? (
            <Text style={type.bodyMuted}>You haven't blocked anyone.</Text>
          ) : (
            blocked.map((b) => (
              <View
                key={b.id}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
              >
                <Text style={[type.body, { flex: 1 }]}>{b.name}</Text>
                <Pressable
                  onPress={async () => {
                    await api.delete(`/users/${b.username}/block`).catch(() => undefined);
                    setBlocked((prev) => prev.filter((x) => x.id !== b.id));
                  }}
                  style={{
                    paddingHorizontal: spacing.md,
                    paddingVertical: 6,
                    borderRadius: radius.pill,
                    backgroundColor: colors.surfaceSunken,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textMuted }}>
                    Unblock
                  </Text>
                </Pressable>
              </View>
            ))
          )}
        </ClayCard>

        <ClayButton
          title="Sign out"
          variant="danger"
          full
          onPress={() =>
            Alert.alert('Sign out?', undefined, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign out', style: 'destructive', onPress: () => void logout() },
            ])
          }
        />
      </ScrollView>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={type.caption}>{label}</Text>
      <Text style={[type.body, { fontWeight: '700' }]}>{value}</Text>
    </View>
  );
}
