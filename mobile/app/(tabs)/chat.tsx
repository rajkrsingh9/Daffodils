import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  Avatar,
  Badge,
  ClayCard,
  EmptyState,
  Screen,
  formatCountdown,
  timeAgo,
} from '../../components/shared';
import { colors, spacing, type } from '../../constants/theme';
import { api, unwrap } from '../../services/api';

interface Room {
  id: string;
  status: 'OPEN' | 'CLOSED';
  expiresAt: string;
  expiresInMs: number;
  matchId: string;
  intent: { id: string; title: string; activityEmoji: string; locationName: string };
  partner: { id: string; name: string; username: string; avatarUrl: string | null };
  lastMessage: {
    id: string;
    type: string;
    body: string | null;
    senderId: string;
    createdAt: string;
  } | null;
  unreadCount: number;
}

export default function ChatTab() {
  const router = useRouter();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      setRooms(await unwrap<Room[]>(api.get('/chat/rooms')));
    } catch {
      /* handled by the empty state */
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

  return (
    <Screen>
      <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
        <Text style={[type.caption, { marginBottom: 2 }]}>Match conversations</Text>
        <Text style={type.display}>Chat</Text>
      </View>

      <FlatList
        data={rooms}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.xxl * 2,
          gap: spacing.md,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={colors.primaryDeep}
          />
        }
        renderItem={({ item }) => {
          const closed = item.status === 'CLOSED' || item.expiresInMs <= 0;
          const preview =
            item.lastMessage?.type === 'IMAGE'
              ? '📷 Photo'
              : item.lastMessage?.type === 'LOCATION'
                ? '📍 Location'
                : (item.lastMessage?.body ?? 'Say hello');

          return (
            <Pressable
              onPress={() => router.push(`/chat/${item.id}`)}
              style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
            >
              <ClayCard style={{ gap: spacing.sm, opacity: closed ? 0.72 : 1 }}>
                <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
                  <Avatar uri={item.partner.avatarUrl} name={item.partner.name} size={48} />

                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <Text style={type.heading} numberOfLines={1}>
                        {item.partner.name}
                      </Text>
                      {item.unreadCount > 0 ? (
                        <Badge
                          label={String(item.unreadCount)}
                          color={colors.onDark}
                          soft={colors.danger}
                        />
                      ) : null}
                    </View>

                    <Text style={type.caption} numberOfLines={1}>
                      {item.intent.activityEmoji} {item.intent.title}
                    </Text>

                    <Text
                      style={[
                        type.bodyMuted,
                        { fontSize: 13 },
                        item.unreadCount > 0 && { color: colors.text, fontWeight: '700' },
                      ]}
                      numberOfLines={1}
                    >
                      {preview}
                    </Text>
                  </View>

                  <View style={{ alignItems: 'flex-end', gap: 5 }}>
                    {item.lastMessage ? (
                      <Text style={type.caption}>{timeAgo(item.lastMessage.createdAt)}</Text>
                    ) : null}
                    <Badge
                      label={closed ? 'CLOSED' : formatCountdown(item.expiresInMs).toUpperCase()}
                      color={closed ? colors.textFaint : colors.success}
                      soft={closed ? colors.surfaceSunken : colors.mintSoft}
                      dot={!closed}
                    />
                  </View>
                </View>
              </ClayCard>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.primaryDeep} />
          ) : (
            <EmptyState
              emoji="💬"
              title="No conversations yet"
              body="A private chat opens the moment you and someone else confirm a plan. It closes automatically after the activity window."
            />
          )
        }
      />
    </Screen>
  );
}
