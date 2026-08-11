import React, { useCallback } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  Avatar,
  Badge,
  ClayCard,
  EmptyState,
  Screen,
} from '../../components/shared';
import { PostCard } from '../../components/post/PostCard';
import { colors, radius, shadows, spacing, type, clayEdge } from '../../constants/theme';
import { useFeed } from '../../hooks/useFeed';
import { useAuthStore } from '../../stores/authStore';
import { api, unwrap } from '../../services/api';

export default function FeedTab() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { items, loading, refreshing, loadingMore, hasMore, refresh, loadMore, react } =
    useFeed();

  const [unread, setUnread] = React.useState(0);

  useFocusEffect(
    useCallback(() => {
      unwrap<{ count: number }>(api.get('/notifications/unread-count'))
        .then((d) => setUnread(d.count))
        .catch(() => undefined);
    }, [])
  );

  return (
    <Screen>
      {/* header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.md,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={[type.caption, { marginBottom: 2 }]}>
            {user?.city ? `Around ${user.city}` : 'Around you'}
          </Text>
          <Text style={type.display}>Feed 🌼</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Notifications${unread ? `, ${unread} unread` : ''}`}
          onPress={() => router.push('/notifications')}
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
          <Text style={{ fontSize: 18 }}>🔔</Text>
          {unread > 0 ? (
            <View
              style={{
                position: 'absolute',
                top: 6,
                right: 6,
                minWidth: 16,
                height: 16,
                paddingHorizontal: 3,
                borderRadius: 8,
                backgroundColor: colors.danger,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: colors.onDark, fontSize: 9, fontWeight: '900' }}>
                {unread > 9 ? '9+' : unread}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
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
        ListHeaderComponent={user?.faceVerified ? null : <VerifyPrompt />}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            onReact={(t) => react(item.id, t)}
            onConvertToIntent={
              item.author.id === user?.id
                ? () =>
                    router.push({
                      pathname: '/intent/compose',
                      params: { fromPostId: item.id, title: item.caption },
                    })
                : undefined
            }
          />
        )}
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.primaryDeep} />
          ) : (
            <EmptyState
              emoji="🌱"
              title="Nothing around you yet"
              body="Posts from people nearby show up here. Be the first — share a moment or a vibe check."
            />
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator style={{ marginVertical: spacing.lg }} color={colors.primaryDeep} />
          ) : items.length && !hasMore ? (
            <Text style={[type.caption, { textAlign: 'center', marginVertical: spacing.lg }]}>
              You're all caught up
            </Text>
          ) : null
        }
      />
    </Screen>
  );
}

/** Face verification is required to create or join intents — nudge, don't block. */
function VerifyPrompt() {
  const router = useRouter();

  return (
    <Pressable onPress={() => router.push('/face/enroll?mode=enroll')}>
      <ClayCard tone="primary" style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Text style={{ fontSize: 28 }}>🪪</Text>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Text style={type.heading}>Verify your face</Text>
              <Badge label="REQUIRED" color={colors.primaryDeep} soft={colors.surface} />
            </View>
            <Text style={[type.bodyMuted, { marginTop: 4 }]}>
              You can build your profile and post freely — but creating or joining an intent
              needs a verified face. Takes about 20 seconds.
            </Text>
          </View>
        </View>
        <Text style={{ color: colors.primaryDeep, fontWeight: '800', fontSize: 13 }}>
          Start verification →
        </Text>
      </ClayCard>
    </Pressable>
  );
}
