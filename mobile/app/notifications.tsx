import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ClayCard,
  EmptyState,
  Screen,
  ScreenHeader,
  timeAgo,
} from '../components/shared';
import { colors, radius, spacing, type } from '../constants/theme';
import { api, unwrap } from '../services/api';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, string> | null;
  readAt: string | null;
  createdAt: string;
}

const ICONS: Record<string, string> = {
  INTENT_BROADCAST: '⚡️',
  INTENT_RESPONSE: '🙌',
  SELECTION_REQUEST: '🤝',
  MATCH_CONFIRMED: '🌼',
  MATCH_DECLINED: '💔',
  CHAT_MESSAGE: '💬',
  RATING_REQUEST: '⭐️',
  ACTIVITY_LOG_DRAFT: '🗓',
  SOS_ALERT: '🚨',
  SYSTEM: '🔔',
};

export default function NotificationsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const data = await unwrap<{ items: Notification[] }>(api.get('/notifications'));
      setItems(data.items);
      // Opening the screen is the read receipt.
      await api.post('/notifications/read', {}).catch(() => undefined);
    } catch {
      /* empty state handles it */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  /** Each notification type knows where it should land. */
  const open = (n: Notification) => {
    const d = n.data ?? {};
    if (n.type === 'SELECTION_REQUEST' && d.intentId) return router.push(`/intent/${d.intentId}`);
    if (d.matchId) return router.push(`/match/${d.matchId}`);
    if (d.roomId) return router.push(`/chat/${d.roomId}`);
    if (d.intentId) return router.push(`/intent/${d.intentId}`);
    if (d.postId) return router.push(`/post/${d.postId}`);
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader title="Notifications" onBack />

      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.xxl,
          gap: spacing.sm,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={colors.primaryDeep}
          />
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => open(item)}>
            <ClayCard
              depth="sm"
              tone={item.readAt ? 'surface' : 'primary'}
              style={{ gap: spacing.sm }}
            >
              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: radius.sm,
                    backgroundColor: colors.surfaceSunken,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 19 }}>{ICONS[item.type] ?? '🔔'}</Text>
                </View>

                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={type.heading} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={type.bodyMuted} numberOfLines={2}>
                    {item.body}
                  </Text>
                  <Text style={type.caption}>{timeAgo(item.createdAt)}</Text>
                </View>

                {!item.readAt ? (
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: colors.primaryDeep,
                      marginTop: 6,
                    }}
                  />
                ) : null}
              </View>
            </ClayCard>
          </Pressable>
        )}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.primaryDeep} />
          ) : (
            <EmptyState
              emoji="🔔"
              title="Nothing yet"
              body="Intents near you, people raising a hand, and match confirmations all land here."
            />
          )
        }
      />
    </Screen>
  );
}
