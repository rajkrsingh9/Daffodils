import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  ClayButton,
  ClayCard,
  Screen,
  ScreenHeader,
} from '../../components/shared';
import { clayEdge, colors, radius, shadows, spacing, type } from '../../constants/theme';
import { api, apiError, unwrap } from '../../services/api';
import { computeFaceDescriptor } from '../../services/face';
import { useAuthStore } from '../../stores/authStore';

type Mode = 'enroll' | 'verify';

/**
 * Face enrolment / live verification.
 *
 * Flow: server issues a single-use liveness challenge → the user performs the
 * gesture and we capture a frame → the frame is reduced to a 128-float
 * descriptor on-device → only that vector is sent. The photo never leaves the
 * phone.
 */
export default function FaceCapture() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: Mode; next?: string }>();
  const mode: Mode = params.mode === 'verify' ? 'verify' : 'enroll';

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const refreshUser = useAuthStore((s) => s.refreshUser);

  const [challenge, setChallenge] = useState<{ token: string; gesture: string } | null>(null);
  const [stage, setStage] = useState<'intro' | 'ready' | 'working' | 'done'>('intro');
  const [error, setError] = useState<string | null>(null);

  const beginChallenge = async () => {
    setError(null);
    setStage('working');
    try {
      const data = await unwrap<{ challengeToken: string; gesture: string }>(
        api.post('/face/challenge')
      );
      setChallenge({ token: data.challengeToken, gesture: data.gesture });
      setStage('ready');
    } catch (err) {
      setError(apiError(err));
      setStage('intro');
    }
  };

  const capture = async () => {
    if (!cameraRef.current || !challenge) return;
    setStage('working');
    setError(null);

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.6, skipProcessing: true });
      if (!photo?.uri) throw new Error('Could not capture a frame');

      const descriptor = await computeFaceDescriptor(photo.uri);

      if (mode === 'enroll') {
        await api.post('/face/enroll', { descriptor, challengeToken: challenge.token });
      } else {
        await api.post('/face/verify', { descriptor, challengeToken: challenge.token });
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined
      );
      await refreshUser();
      setStage('done');
    } catch (err) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        () => undefined
      );
      setError(apiError(err));
      // The challenge is single-use — burned whether we passed or failed.
      setChallenge(null);
      setStage('intro');
    }
  };

  // ── permission gate ──────────────────────────────────────────────────
  if (!permission) {
    return (
      <Screen>
        <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.primaryDeep} />
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen>
        <ScreenHeader title="Camera access" onBack />
        <View style={{ padding: spacing.xl, gap: spacing.lg }}>
          <ClayCard>
            <Text style={{ fontSize: 40, marginBottom: spacing.sm }}>📷</Text>
            <Text style={type.heading}>Camera needed for verification</Text>
            <Text style={[type.bodyMuted, { marginTop: spacing.sm }]}>
              Daffodils requires a verified face before you can create or join an intent.
              We keep the maths, not the photo — the image is processed on your phone and
              discarded.
            </Text>
          </ClayCard>
          <ClayButton title="Allow camera" full size="lg" onPress={requestPermission} />
        </View>
      </Screen>
    );
  }

  // ── success ──────────────────────────────────────────────────────────
  if (stage === 'done') {
    return (
      <Screen>
        <ScreenHeader title="Verified" />
        <View style={{ flex: 1, padding: spacing.xl, gap: spacing.lg, justifyContent: 'center' }}>
          <View style={{ alignItems: 'center', gap: spacing.md }}>
            <View
              style={[
                {
                  width: 110,
                  height: 110,
                  borderRadius: radius.xl,
                  backgroundColor: colors.mintSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                },
                shadows.clayLg,
                clayEdge,
              ]}
            >
              <Text style={{ fontSize: 50 }}>✓</Text>
            </View>
            <Text style={[type.title, { textAlign: 'center' }]}>
              {mode === 'enroll' ? "You're verified" : 'Verification passed'}
            </Text>
            <Text style={[type.bodyMuted, { textAlign: 'center' }]}>
              You can now create intents and join other people's plans.
            </Text>
          </View>

          <ClayButton
            title="Continue"
            full
            size="lg"
            onPress={() => {
              if (params.next) router.replace(params.next as never);
              else router.back();
            }}
          />
        </View>
      </Screen>
    );
  }

  // ── capture ──────────────────────────────────────────────────────────
  return (
    <Screen>
      <ScreenHeader
        title={mode === 'enroll' ? 'Face verification' : 'Confirm it’s you'}
        subtitle="Required before creating or joining an intent"
        onBack
      />

      <View style={{ flex: 1, padding: spacing.xl, gap: spacing.lg }}>
        <View style={{ alignItems: 'center' }}>
          <View
            style={[
              {
                width: 260,
                height: 260,
                borderRadius: 130,
                overflow: 'hidden',
                backgroundColor: colors.surfaceSunken,
                borderWidth: 4,
                borderColor: challenge ? colors.primary : colors.border,
              },
              shadows.clayLg,
            ]}
          >
            <CameraView ref={cameraRef} style={{ flex: 1 }} facing="front" />
          </View>
        </View>

        {challenge ? (
          <ClayCard tone="primary" depth="sm">
            <Text style={type.label}>LIVENESS CHECK</Text>
            <Text style={[type.heading, { marginTop: 4, textTransform: 'capitalize' }]}>
              {challenge.gesture}
            </Text>
            <Text style={[type.caption, { marginTop: 4 }]}>
              Then tap capture. This check expires in 2 minutes.
            </Text>
          </ClayCard>
        ) : (
          <ClayCard depth="sm">
            <Text style={type.heading}>Why this is required</Text>
            <Text style={[type.bodyMuted, { marginTop: spacing.sm }]}>
              Everyone you can meet through Daffodils has passed this check. Your photo is
              reduced to a numeric signature on this device — the image itself is never
              uploaded or stored.
            </Text>
          </ClayCard>
        )}

        {error ? (
          <Text style={[type.caption, { color: colors.danger, textAlign: 'center' }]}>
            {error}
          </Text>
        ) : null}

        <View style={{ flex: 1 }} />

        {stage === 'ready' && challenge ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Capture"
            onPress={capture}
            style={({ pressed }) => [
              {
                alignSelf: 'center',
                width: 76,
                height: 76,
                borderRadius: 38,
                backgroundColor: colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
                transform: [{ translateY: pressed ? 2 : 0 }],
              },
              pressed ? shadows.clayPressed : shadows.primary,
              clayEdge,
            ]}
          >
            <View
              style={{
                width: 58,
                height: 58,
                borderRadius: 29,
                borderWidth: 3,
                borderColor: colors.onPrimary,
              }}
            />
          </Pressable>
        ) : (
          <ClayButton
            title={mode === 'enroll' ? 'Start verification' : 'Start check'}
            full
            size="lg"
            loading={stage === 'working'}
            onPress={beginChallenge}
          />
        )}
      </View>
    </Screen>
  );
}
