import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  Avatar,
  Badge,
  ClayInput,
  EmptyState,
  Screen,
  ScreenHeader,
  SOSButton,
  formatCountdown,
} from '../../components/shared';
import { clayEdge, colors, radius, shadows, spacing, type } from '../../constants/theme';
import { api, apiError, unwrap } from '../../services/api';
import { connectSocket, getSocket } from '../../services/socket';
import { useAuthStore } from '../../stores/authStore';
import { useChatStore, type ChatMessage } from '../../stores/chatStore';
import { useLiveEventStore } from '../../stores/liveEventStore';
import { useLocationStore } from '../../stores/locationStore';

interface Room {
  id: string;
  status: 'OPEN' | 'CLOSED';
  expiresAt: string;
  expiresInMs: number;
  matchId: string;
  readOnly: boolean;
  intent: { id: string; title: string; activityEmoji: string; locationName: string };
  partner: { id: string; name: string; username: string; avatarUrl: string | null };
}

export default function ChatRoom() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const router = useRouter();
  const me = useAuthStore((s) => s.user);
  const coords = useLocationStore((s) => s.coords);
  const refreshLocation = useLocationStore((s) => s.refresh);

  const messages = useChatStore((s) => (roomId ? (s.messagesByRoom[roomId] ?? []) : []));
  const { setMessages, addMessage, replaceMessage, markFailed } = useChatStore();

  const [room, setRoom] = useState<Room | null>(null);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  // ── load + socket wiring ─────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!roomId) return;
    try {
      const [r, history] = await Promise.all([
        unwrap<Room>(api.get(`/chat/rooms/${roomId}`)),
        unwrap<{ items: ChatMessage[] }>(api.get(`/chat/rooms/${roomId}/messages`)),
      ]);
      setRoom(r);
      setMessages(roomId, history.items);
      await api.post(`/chat/rooms/${roomId}/read`).catch(() => undefined);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, [roomId, setMessages]);

  useEffect(() => {
    void load();
  }, [load]);

  // While this exact room is open, the global toast for it is redundant —
  // the message is already arriving live in the thread below.
  useFocusEffect(
    useCallback(() => {
      if (!roomId) return;
      useLiveEventStore.getState().setActiveChatRoom(roomId);
      return () => useLiveEventStore.getState().setActiveChatRoom(null);
    }, [roomId])
  );

  useEffect(() => {
    if (!roomId) return;
    let active = true;

    (async () => {
      const socket = (await connectSocket()) ?? getSocket();
      if (!socket || !active) return;

      socket.emit('room:join', roomId, () => undefined);

      const onNew = (message: ChatMessage) => {
        if (message.roomId !== roomId) return;
        addMessage(roomId, message);
        // Our own optimistic copy is still on screen; drop it now the real
        // row has arrived.
        if (message.senderId === me?.id) {
          useChatStore.setState((s) => ({
            messagesByRoom: {
              ...s.messagesByRoom,
              [roomId]: (s.messagesByRoom[roomId] ?? []).filter(
                (m) => !(m.pending && m.body === message.body)
              ),
            },
          }));
        }
        void api.post(`/chat/rooms/${roomId}/read`).catch(() => undefined);
      };

      const onClosed = () => {
        setRoom((prev) => (prev ? { ...prev, status: 'CLOSED', readOnly: true } : prev));
      };

      socket.on('message:new', onNew);
      socket.on('room:closed', onClosed);

      return () => {
        socket.off('message:new', onNew);
        socket.off('room:closed', onClosed);
        socket.emit('room:leave', roomId);
      };
    })();

    return () => {
      active = false;
    };
  }, [roomId, addMessage, me?.id]);

  // ── send ─────────────────────────────────────────────────────────────
  const send = async (payload: Partial<ChatMessage> & { type: ChatMessage['type'] }) => {
    if (!roomId || !room || room.readOnly) return;

    const tempId = `temp-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: tempId,
      roomId,
      senderId: me?.id ?? '',
      type: payload.type,
      body: payload.body ?? null,
      mediaUrl: payload.mediaUrl ?? null,
      lat: payload.lat ?? null,
      lng: payload.lng ?? null,
      readAt: null,
      createdAt: new Date().toISOString(),
      pending: true,
    };
    addMessage(roomId, optimistic);
    setBody('');

    try {
      const saved = await unwrap<ChatMessage>(
        api.post(`/chat/rooms/${roomId}/messages`, {
          type: payload.type,
          body: payload.body ?? null,
          mediaUrl: payload.mediaUrl ?? null,
          lat: payload.lat ?? null,
          lng: payload.lng ?? null,
        })
      );
      replaceMessage(roomId, tempId, saved);
    } catch (err) {
      markFailed(roomId, tempId);
      Alert.alert('Message not sent', apiError(err));
    }
  };

  const sendLocationPing = async () => {
    const location = coords ?? (await refreshLocation());
    if (!location) {
      Alert.alert('Location unavailable', 'Enable location to share where you are.');
      return;
    }
    await send({ type: 'LOCATION', lat: location.lat, lng: location.lng });
  };

  const sendImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (result.canceled) return;

    const uri = result.assets[0].uri;
    if (!/^https?:\/\//.test(uri)) {
      // Local URIs are not reachable by the other device — a production build
      // uploads to Cloudinary first and sends the CDN URL.
      Alert.alert(
        'Image upload not configured',
        'Add Cloudinary credentials to the backend .env to enable photo messages.'
      );
      return;
    }
    await send({ type: 'IMAGE', mediaUrl: uri });
  };

  const triggerSos = async () => {
    const location = coords ?? (await refreshLocation());
    try {
      const res = await unwrap<{ hasTrustedContact: boolean; warning?: string }>(
        api.post('/safety/sos', {
          ...(location ? { lat: location.lat, lng: location.lng } : {}),
          matchId: room?.matchId,
        })
      );
      Alert.alert(
        res.hasTrustedContact ? 'Alert sent' : 'Logged',
        res.warning ?? 'Your trusted contact has been sent your location.'
      );
    } catch (err) {
      Alert.alert('SOS failed', apiError(err));
    }
  };

  const expiresInMs = useMemo(
    () => (room ? new Date(room.expiresAt).getTime() - Date.now() : 0),
    [room]
  );

  if (loading) {
    return (
      <Screen>
        <ScreenHeader title="Chat" onBack />
        <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.primaryDeep} />
      </Screen>
    );
  }

  if (!room) {
    return (
      <Screen>
        <ScreenHeader title="Chat" onBack />
        <EmptyState emoji="🚫" title="Conversation unavailable" body={error ?? undefined} />
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      {/* header shows the matched activity + countdown */}
      <ScreenHeader
        title={room.partner.name}
        subtitle={`${room.intent.activityEmoji} ${room.intent.title}`}
        onBack
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Badge
              label={room.readOnly ? 'CLOSED' : formatCountdown(expiresInMs).toUpperCase()}
              color={room.readOnly ? colors.textFaint : colors.success}
              soft={room.readOnly ? colors.surfaceSunken : colors.mintSoft}
              dot={!room.readOnly}
            />
            <Pressable onPress={() => router.push(`/match/${room.matchId}`)}>
              <Avatar uri={room.partner.avatarUrl} name={room.partner.name} size={36} />
            </Pressable>
          </View>
        }
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => (
            <MessageBubble message={item} isMine={item.senderId === me?.id} />
          )}
          ListEmptyComponent={
            <EmptyState
              emoji="👋"
              title="Say hello"
              body={`Agree where exactly to meet for ${room.intent.title}.`}
            />
          }
        />

        {room.readOnly ? (
          <View
            style={{
              padding: spacing.lg,
              alignItems: 'center',
              gap: 4,
              borderTopWidth: 1,
              borderTopColor: colors.borderSoft,
            }}
          >
            <Text style={[type.body, { fontWeight: '700' }]}>This conversation has closed</Text>
            <Text style={[type.caption, { textAlign: 'center' }]}>
              Chats close after the activity window. History stays here for 30 days.
            </Text>
          </View>
        ) : (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-end',
              gap: spacing.sm,
              padding: spacing.lg,
              borderTopWidth: 1,
              borderTopColor: colors.borderSoft,
              backgroundColor: colors.bg,
            }}
          >
            <IconBtn icon="📍" label="Send your location" onPress={sendLocationPing} />
            <IconBtn icon="📷" label="Send a photo" onPress={sendImage} />

            <View style={{ flex: 1 }}>
              <ClayInput
                value={body}
                onChangeText={setBody}
                placeholder="Message…"
                maxLength={2000}
                multiline
              />
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send"
              disabled={!body.trim()}
              onPress={() => send({ type: 'TEXT', body: body.trim() })}
              style={[
                {
                  width: 48,
                  height: 48,
                  borderRadius: radius.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: body.trim() ? colors.primary : colors.surfaceSunken,
                },
                body.trim() ? shadows.primary : undefined,
                clayEdge,
              ]}
            >
              <Text style={{ fontSize: 17 }}>↑</Text>
            </Pressable>

            <SOSButton onPress={triggerSos} size={48} />
          </View>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

function IconBtn({
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
          height: 48,
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

function MessageBubble({ message, isMine }: { message: ChatMessage; isMine: boolean }) {
  const time = new Date(message.createdAt).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  if (message.type === 'SYSTEM') {
    return (
      <View style={{ alignItems: 'center', paddingVertical: spacing.sm }}>
        <View
          style={{
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            borderRadius: radius.md,
            backgroundColor: colors.surfaceSunken,
            maxWidth: '90%',
          }}
        >
          <Text style={[type.caption, { textAlign: 'center' }]}>{message.body}</Text>
        </View>
      </View>
    );
  }

  return (
    <View
      style={{
        alignSelf: isMine ? 'flex-end' : 'flex-start',
        maxWidth: '82%',
        opacity: message.pending ? 0.6 : 1,
      }}
    >
      <View
        style={[
          {
            padding: spacing.md,
            borderRadius: radius.lg,
            backgroundColor: isMine ? colors.primary : colors.surface,
            // Flatten the corner nearest the sender so the bubble points at them.
            borderBottomRightRadius: isMine ? 6 : radius.lg,
            borderBottomLeftRadius: isMine ? radius.lg : 6,
            gap: 6,
          },
          shadows.claySm,
          clayEdge,
        ]}
      >
        {message.type === 'IMAGE' && message.mediaUrl ? (
          <Image
            source={{ uri: message.mediaUrl }}
            style={{ width: 200, height: 150, borderRadius: radius.md }}
          />
        ) : null}

        {message.type === 'LOCATION' ? (
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 22 }}>📍</Text>
            <Text
              style={[
                type.body,
                { fontWeight: '700', color: isMine ? colors.onPrimary : colors.text },
              ]}
            >
              Shared their location
            </Text>
            <Text
              style={[
                type.caption,
                { color: isMine ? 'rgba(59,46,0,0.65)' : colors.textFaint },
              ]}
            >
              {message.lat?.toFixed(4)}, {message.lng?.toFixed(4)}
            </Text>
          </View>
        ) : null}

        {message.body ? (
          <Text style={[type.body, { color: isMine ? colors.onPrimary : colors.text }]}>
            {message.body}
          </Text>
        ) : null}

        <Text
          style={{
            fontSize: 10,
            fontWeight: '700',
            alignSelf: 'flex-end',
            color: isMine ? 'rgba(59,46,0,0.55)' : colors.textFaint,
          }}
        >
          {message.failed ? 'failed' : message.pending ? 'sending…' : time}
        </Text>
      </View>
    </View>
  );
}
