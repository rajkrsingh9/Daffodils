import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  Chip,
  ClayButton,
  ClayCard,
  ClayInput,
  Screen,
  ScreenHeader,
  SectionTitle,
} from '../../components/shared';
import { PostCard } from '../../components/post/PostCard';
import { config } from '../../constants/config';
import { colors, postType as postTypes, radius, spacing, type } from '../../constants/theme';
import { api, apiError, unwrap } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { useLocationStore } from '../../stores/locationStore';

type ComposeType = 'MOMENT' | 'VIBE_CHECK' | 'WISHLIST';
const TYPES: ComposeType[] = ['MOMENT', 'VIBE_CHECK', 'WISHLIST'];

export default function PostCompose() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const coords = useLocationStore((s) => s.coords);

  const [postKind, setPostKind] = useState<ComposeType>('MOMENT');
  const [caption, setCaption] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [locationName, setLocationName] = useState('');
  const [tagLocation, setTagLocation] = useState(false);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState<{ remaining: number; limit: number } | null>(null);

  useEffect(() => {
    unwrap<{ remaining: number; limit: number }>(api.get('/posts/me/quota'))
      .then(setQuota)
      .catch(() => undefined);
  }, []);

  const pickImages = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: config.maxPostImages - images.length,
      quality: 0.8,
    });
    if (!result.canceled) {
      setImages((prev) =>
        [...prev, ...result.assets.map((a) => a.uri)].slice(0, config.maxPostImages)
      );
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await unwrap<{ post: { id: string; type: string } }>(
        api.post('/posts', {
          type: postKind,
          caption: caption.trim(),
          // Local file URIs are not reachable by the server; a production build
          // uploads to Cloudinary first and sends the returned CDN URLs.
          mediaUrls: images.filter((u) => /^https?:\/\//.test(u)),
          ...(tagLocation && locationName
            ? { locationName, lat: coords?.lat ?? null, lng: coords?.lng ?? null }
            : {}),
        })
      );

      if (postKind === 'WISHLIST') {
        router.replace({
          pathname: '/intent/compose',
          params: { fromPostId: created.post.id, title: caption.trim() },
        });
      } else {
        router.back();
      }
    } catch (err) {
      setError(apiError(err));
      setPreview(false);
    } finally {
      setBusy(false);
    }
  };

  const overLimit = caption.length > config.postCaptionLimit;
  const canPost = caption.trim().length > 0 && !overLimit;

  // ── preview step ─────────────────────────────────────────────────────
  if (preview) {
    return (
      <Screen edges={['top', 'bottom']}>
        <ScreenHeader title="Preview" subtitle="This is how it will look" onBack={() => setPreview(false)} />
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
          <PostCard
            post={{
              id: 'preview',
              type: postKind,
              caption: caption.trim(),
              mediaUrls: images,
              locationName: tagLocation ? locationName : null,
              likeCount: 0,
              commentCount: 0,
              createdAt: new Date().toISOString(),
              author: {
                id: user?.id ?? '',
                name: user?.name ?? 'You',
                username: user?.username ?? 'you',
                avatarUrl: user?.avatarUrl ?? null,
                city: user?.city ?? null,
                trustTier: user?.trustTier ?? 'TIER_1',
              },
              myReaction: null,
            }}
          />

          {error ? (
            <Text style={[type.caption, { color: colors.danger, textAlign: 'center' }]}>
              {error}
            </Text>
          ) : null}

          <ClayButton title="Publish" full size="lg" loading={busy} onPress={submit} />
          <ClayButton
            title="Keep editing"
            variant="ghost"
            full
            onPress={() => setPreview(false)}
          />
        </ScrollView>
      </Screen>
    );
  }

  // ── compose step ─────────────────────────────────────────────────────
  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader
        title="New post"
        subtitle={quota ? `${quota.remaining} of ${quota.limit} left today` : undefined}
        onBack
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl }}
          keyboardShouldPersistTaps="handled"
        >
          <View>
            <SectionTitle title="Type" />
            <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
              {TYPES.map((t) => (
                <Chip
                  key={t}
                  label={postTypes[t].label}
                  emoji={postTypes[t].emoji}
                  color={postTypes[t].color}
                  softColor={postTypes[t].soft}
                  selected={postKind === t}
                  onPress={() => setPostKind(t)}
                />
              ))}
            </View>
            <Text style={[type.caption, { marginTop: spacing.sm }]}>
              {postKind === 'MOMENT'
                ? 'A photo and a line from something you did.'
                : postKind === 'VIBE_CHECK'
                  ? 'A short mood post — "craving an evening walk".'
                  : 'Somewhere you want to go. You can turn it into a live intent right after posting.'}
            </Text>
          </View>

          <ClayInput
            label="Caption"
            value={caption}
            onChangeText={setCaption}
            placeholder={
              postKind === 'WISHLIST'
                ? 'Someone take me to Teretti Bazaar'
                : 'What happened?'
            }
            multiline
            counter={{ value: caption.length, max: config.postCaptionLimit }}
            error={overLimit ? 'Caption is too long' : null}
          />

          {postKind !== 'VIBE_CHECK' ? (
            <View style={{ gap: spacing.sm }}>
              <Text style={type.label}>PHOTOS ({images.length}/{config.maxPostImages})</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {images.map((uri, i) => (
                  <Pressable
                    key={`${uri}-${i}`}
                    onPress={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    <Image
                      source={{ uri }}
                      style={{
                        width: 76,
                        height: 76,
                        borderRadius: radius.md,
                        backgroundColor: colors.surfaceSunken,
                      }}
                    />
                    <View
                      style={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        backgroundColor: colors.danger,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ color: colors.onDark, fontSize: 11, fontWeight: '900' }}>
                        ×
                      </Text>
                    </View>
                  </Pressable>
                ))}

                {images.length < config.maxPostImages ? (
                  <Pressable
                    onPress={pickImages}
                    style={{
                      width: 76,
                      height: 76,
                      borderRadius: radius.md,
                      backgroundColor: colors.surfaceSunken,
                      borderWidth: 1.5,
                      borderColor: colors.border,
                      borderStyle: 'dashed',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 22, color: colors.textFaint }}>+</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}

          <ClayCard tone="sunken" depth="none" style={{ gap: spacing.sm }}>
            <Pressable
              onPress={() => setTagLocation((v) => !v)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 7,
                  borderWidth: 2,
                  borderColor: tagLocation ? colors.primary : colors.border,
                  backgroundColor: tagLocation ? colors.primary : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {tagLocation ? (
                  <Text style={{ fontSize: 12, color: colors.onPrimary, fontWeight: '900' }}>
                    ✓
                  </Text>
                ) : null}
              </View>
              <Text style={[type.body, { flex: 1 }]}>Tag a location</Text>
            </Pressable>

            {tagLocation ? (
              <ClayInput
                value={locationName}
                onChangeText={setLocationName}
                placeholder="Flurys, Park Street"
                maxLength={160}
              />
            ) : null}
          </ClayCard>

          {error ? (
            <Text style={[type.caption, { color: colors.danger }]}>{error}</Text>
          ) : null}

          <ClayButton
            title="Preview"
            full
            size="lg"
            disabled={!canPost}
            onPress={() => setPreview(true)}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
