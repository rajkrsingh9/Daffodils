import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ClayButton,
  ClayCard,
  ClayInput,
  Screen,
  ScreenHeader,
} from '../../../components/shared';
import { config } from '../../../constants/config';
import { colors, spacing, type } from '../../../constants/theme';
import { api, apiError, unwrap } from '../../../services/api';

/**
 * Activity Log drafts are written by the server when an activity completes.
 * Publishing is explicitly optional (spec §6) — this screen is the "edit and
 * publish, or leave it" step.
 */
export default function PublishDraft() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [caption, setCaption] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    unwrap<{ caption: string }>(api.get(`/posts/${id}`))
      .then((p) => setCaption(p.caption))
      .catch((err) => setError(apiError(err)))
      .finally(() => setLoading(false));
  }, [id]);

  const publish = async () => {
    setBusy(true);
    try {
      await api.post(`/posts/${id}/publish`, { caption: caption.trim() });
      router.replace('/(tabs)/profile');
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    await api.delete(`/posts/${id}`).catch(() => undefined);
    router.back();
  };

  if (loading) {
    return (
      <Screen>
        <ScreenHeader title="Activity log" onBack />
        <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.primaryDeep} />
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader title="Activity log" subtitle="We drafted this — publish only if you want to" onBack />

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <ClayCard tone="sunken" depth="none">
          <Text style={type.label}>WHY THIS EXISTS</Text>
          <Text style={[type.bodyMuted, { marginTop: spacing.sm }]}>
            Activity logs show you actually meet people, which is the strongest trust signal on
            a profile. Nothing is published without you tapping publish.
          </Text>
        </ClayCard>

        <ClayInput
          label="Caption"
          value={caption}
          onChangeText={setCaption}
          multiline
          maxLength={config.postCaptionLimit}
          counter={{ value: caption.length, max: config.postCaptionLimit }}
          error={error}
        />

        <ClayButton
          title="Publish to my profile"
          full
          size="lg"
          loading={busy}
          disabled={!caption.trim()}
          onPress={publish}
        />
        <ClayButton title="Discard draft" variant="ghost" full onPress={discard} />
      </ScrollView>
    </Screen>
  );
}
