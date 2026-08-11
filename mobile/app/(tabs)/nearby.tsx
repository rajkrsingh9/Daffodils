import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Chip,
  ClayButton,
  ClayCard,
  EmptyState,
  Screen,
} from '../../components/shared';
import { IntentCard } from '../../components/intent/IntentCard';
// No extension: Metro resolves IntentMapView.tsx on native and
// IntentMapView.web.tsx on web, so react-native-maps is never bundled for
// web at all (its import crashes at load time under react-native-web).
import { IntentMapView } from '../../components/intent/IntentMapView';
import { colors, radius, shadows, spacing, type, vibe as vibes, VibeKey } from '../../constants/theme';
import { useNearbyIntents } from '../../hooks/useNearbyIntents';
import { useAuthStore } from '../../stores/authStore';

const VIBE_KEYS = Object.keys(vibes) as VibeKey[];

export default function NearbyTab() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [view, setView] = useState<'map' | 'list'>('map');

  const { intents, loading, refreshing, error, vibeFilter, setVibeFilter, refresh, coords } =
    useNearbyIntents(10);

  const region = useMemo(
    () =>
      coords
        ? {
            latitude: coords.lat,
            longitude: coords.lng,
            latitudeDelta: 0.06,
            longitudeDelta: 0.06,
          }
        : undefined,
    [coords]
  );

  // react-native-maps has no web implementation; the list is the full
  // experience there rather than a broken canvas.
  const mapSupported = Platform.OS !== 'web';

  return (
    <Screen>
      <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Text style={[type.caption, { marginBottom: 2 }]}>Live intents nearby</Text>
            <Text style={type.display}>Around me</Text>
          </View>

          {mapSupported ? (
            <View
              style={[
                {
                  flexDirection: 'row',
                  backgroundColor: colors.surfaceSunken,
                  borderRadius: radius.pill,
                  padding: 4,
                },
              ]}
            >
              {(['map', 'list'] as const).map((v) => (
                <Pressable
                  key={v}
                  accessibilityRole="button"
                  accessibilityState={{ selected: view === v }}
                  onPress={() => setView(v)}
                  style={[
                    {
                      paddingHorizontal: spacing.md,
                      paddingVertical: 7,
                      borderRadius: radius.pill,
                      backgroundColor: view === v ? colors.surface : 'transparent',
                    },
                    view === v ? shadows.claySm : undefined,
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '800',
                      color: view === v ? colors.text : colors.textFaint,
                    }}
                  >
                    {v === 'map' ? '🗺 Map' : '☰ List'}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.md }}
        >
          <Chip
            label="All vibes"
            selected={vibeFilter === null}
            onPress={() => setVibeFilter(null)}
            size="sm"
          />
          {VIBE_KEYS.map((key) => (
            <Chip
              key={key}
              label={vibes[key].label}
              emoji={vibes[key].emoji}
              color={vibes[key].color}
              softColor={vibes[key].soft}
              selected={vibeFilter === key}
              onPress={() => setVibeFilter(vibeFilter === key ? null : key)}
              size="sm"
            />
          ))}
        </ScrollView>
      </View>

      {view === 'map' && mapSupported ? (
        <View style={{ flex: 1 }}>
          <View
            style={[
              {
                flex: 1,
                marginHorizontal: spacing.lg,
                borderRadius: radius.lg,
                overflow: 'hidden',
              },
              shadows.clay,
            ]}
          >
            <IntentMapView
              region={region}
              intents={intents}
              error={error}
              onMarkerPress={(id) => router.push(`/intent/${id}`)}
              onRetryLocation={refresh}
            />
          </View>

          {/* Peek sheet: the same intents as scrollable cards below the map. */}
          <View style={{ height: 190, marginTop: spacing.md }}>
            <FlatList
              horizontal
              data={intents}
              keyExtractor={(i) => i.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md }}
              renderItem={({ item }) => (
                <View style={{ width: 300 }}>
                  <IntentCard intent={item} />
                </View>
              )}
              ListEmptyComponent={
                loading ? null : (
                  <ClayCard style={{ width: 300 }}>
                    <Text style={type.heading}>No live intents nearby</Text>
                    <Text style={[type.bodyMuted, { marginTop: 4 }]}>
                      Be the first to post one.
                    </Text>
                    <ClayButton
                      title="Create an intent"
                      size="sm"
                      style={{ marginTop: spacing.md }}
                      onPress={() =>
                        router.push(
                          user?.faceVerified
                            ? '/intent/compose'
                            : '/face/enroll?mode=enroll&next=/intent/compose'
                        )
                      }
                    />
                  </ClayCard>
                )
              }
            />
          </View>
        </View>
      ) : (
        <FlatList
          data={intents}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.xxl * 2,
            gap: spacing.md,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={colors.primaryDeep}
            />
          }
          renderItem={({ item }) => <IntentCard intent={item} />}
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.primaryDeep} />
            ) : (
              <EmptyState
                emoji="🗺"
                title="Nothing live around you"
                body={
                  error ??
                  'When someone nearby posts an intent, it lands here. Try widening your radius or post your own.'
                }
                action={
                  <ClayButton
                    title="Create an intent"
                    onPress={() =>
                      router.push(
                        user?.faceVerified
                          ? '/intent/compose'
                          : '/face/enroll?mode=enroll&next=/intent/compose'
                      )
                    }
                  />
                }
              />
            )
          }
        />
      )}
    </Screen>
  );
}
