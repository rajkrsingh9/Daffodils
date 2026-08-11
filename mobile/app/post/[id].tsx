import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  Avatar,
  Badge,
  ClayCard,
  ClayInput,
  EmptyState,
  Screen,
  ScreenHeader,
  timeAgo,
} from '../../components/shared';
import { PostCard, type Post } from '../../components/post/PostCard';
import { colors, radius, spacing, type } from '../../constants/theme';
import { api, apiError, unwrap } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';

interface Comment {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string; username: string; avatarUrl: string | null };
  replies?: Comment[];
}

export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const me = useAuthStore((s) => s.user);

  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [p, c] = await Promise.all([
        unwrap<Post>(api.get(`/posts/${id}`)),
        unwrap<Comment[]>(api.get(`/posts/${id}/comments`)),
      ]);
      setPost(p);
      setComments(c);
    } catch (err) {
      setError(apiError(err));
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const react = async (t: 'LIKE' | 'DISLIKE') => {
    if (!post) return;
    const wasSame = post.myReaction === t;
    const hadLike = post.myReaction === 'LIKE';
    setPost({
      ...post,
      myReaction: wasSame ? null : t,
      likeCount: post.likeCount + (!wasSame && t === 'LIKE' ? 1 : 0) - (hadLike ? 1 : 0),
    });
    try {
      const fresh = await unwrap<{ likeCount: number; commentCount: number; myReaction: 'LIKE' | 'DISLIKE' | null }>(
        api.post(`/posts/${id}/react`, { type: t })
      );
      setPost((prev) => (prev ? { ...prev, ...fresh } : prev));
    } catch {
      void load();
    }
  };

  const submitComment = async () => {
    if (!body.trim()) return;
    setSending(true);
    try {
      await api.post(`/posts/${id}/comments`, {
        body: body.trim(),
        ...(replyTo ? { parentId: replyTo.id } : {}),
      });
      setBody('');
      setReplyTo(null);
      await load();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setSending(false);
    }
  };

  if (error && !post) {
    return (
      <Screen>
        <ScreenHeader title="Post" onBack />
        <EmptyState emoji="🚫" title="Post unavailable" body={error} />
      </Screen>
    );
  }

  if (!post) {
    return (
      <Screen>
        <ScreenHeader title="Post" onBack />
        <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.primaryDeep} />
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader title="Post" onBack />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl }}
          keyboardShouldPersistTaps="handled"
        >
          <PostCard post={post} onReact={react} />

          {/* Owner-only private dislike tally (spec §7). */}
          {post.isOwner || post.dislikeCount !== undefined ? (
            <ClayCard tone="sunken" depth="none">
              <Text style={type.label}>ONLY YOU CAN SEE THIS</Text>
              <Text style={[type.bodyMuted, { marginTop: 4 }]}>
                {post.dislikeCount ?? 0} dislike{post.dislikeCount === 1 ? '' : 's'}. Dislike
                counts are never shown publicly and nobody is told who tapped it.
              </Text>
            </ClayCard>
          ) : null}

          <Text style={[type.heading, { marginTop: spacing.sm }]}>
            {post.commentCount} comment{post.commentCount === 1 ? '' : 's'}
          </Text>

          {comments.length === 0 ? (
            <EmptyState emoji="💬" title="No comments yet" body="Start the conversation." />
          ) : (
            comments.map((c) => (
              <CommentRow
                key={c.id}
                comment={c}
                onReply={setReplyTo}
                onDelete={async (commentId) => {
                  await api.delete(`/posts/comments/${commentId}`).catch(() => undefined);
                  await load();
                }}
                meId={me?.id}
                postAuthorId={post.author.id}
              />
            ))
          )}
        </ScrollView>

        {/* composer */}
        <View
          style={{
            padding: spacing.lg,
            borderTopWidth: 1,
            borderTopColor: colors.borderSoft,
            backgroundColor: colors.bg,
            gap: spacing.sm,
          }}
        >
          {replyTo ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Badge label={`REPLYING TO @${replyTo.author.username}`} />
              <Pressable onPress={() => setReplyTo(null)}>
                <Text style={{ color: colors.danger, fontWeight: '800', fontSize: 12 }}>
                  Cancel
                </Text>
              </Pressable>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <ClayInput
                value={body}
                onChangeText={setBody}
                placeholder={replyTo ? 'Write a reply…' : 'Add a comment…'}
                maxLength={500}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send comment"
              onPress={submitComment}
              disabled={!body.trim() || sending}
              style={{
                width: 52,
                height: 52,
                borderRadius: radius.md,
                backgroundColor: body.trim() ? colors.primary : colors.surfaceSunken,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {sending ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <Text style={{ fontSize: 18 }}>↑</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function CommentRow({
  comment,
  onReply,
  onDelete,
  meId,
  postAuthorId,
  nested,
}: {
  comment: Comment;
  onReply: (c: Comment) => void;
  onDelete: (id: string) => void;
  meId?: string;
  postAuthorId: string;
  nested?: boolean;
}) {
  const router = useRouter();
  const canDelete = meId === comment.author.id || meId === postAuthorId;

  return (
    <View style={{ marginLeft: nested ? spacing.xl : 0, gap: spacing.sm }}>
      <ClayCard depth={nested ? 'none' : 'sm'} tone={nested ? 'sunken' : 'surface'}>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Pressable onPress={() => router.push(`/profile/${comment.author.username}`)}>
            <Avatar uri={comment.author.avatarUrl} name={comment.author.name} size={32} />
          </Pressable>

          <View style={{ flex: 1, gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Text style={[type.body, { fontWeight: '700' }]}>{comment.author.name}</Text>
              <Text style={type.caption}>{timeAgo(comment.createdAt)}</Text>
            </View>
            <Text style={type.body}>{comment.body}</Text>

            <View style={{ flexDirection: 'row', gap: spacing.lg, marginTop: 2 }}>
              {!nested ? (
                <Pressable onPress={() => onReply(comment)}>
                  <Text style={[type.caption, { fontWeight: '800' }]}>Reply</Text>
                </Pressable>
              ) : null}
              {canDelete ? (
                <Pressable onPress={() => onDelete(comment.id)}>
                  <Text style={[type.caption, { fontWeight: '800', color: colors.danger }]}>
                    Delete
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </ClayCard>

      {comment.replies?.map((r) => (
        <CommentRow
          key={r.id}
          comment={r}
          onReply={onReply}
          onDelete={onDelete}
          meId={meId}
          postAuthorId={postAuthorId}
          nested
        />
      ))}
    </View>
  );
}
