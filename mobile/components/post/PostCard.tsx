import React from 'react';
import { Image, Pressable, Share, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  Avatar,
  ClayCard,
  DistanceBadge,
  IntentLiveBadge,
  timeAgo,
} from '../shared';
import { colors, postType as postTypes, radius, spacing, type } from '../../constants/theme';
import { api } from '../../services/api';

export interface Post {
  id: string;
  type: keyof typeof postTypes;
  caption: string;
  mediaUrls: string[];
  locationName: string | null;
  likeCount: number;
  commentCount: number;
  /** Owner-only. Never present on another user's post. */
  dislikeCount?: number;
  createdAt: string;
  status?: string;
  author: {
    id: string;
    name: string;
    username: string;
    avatarUrl: string | null;
    city: string | null;
    trustTier: 'TIER_1' | 'TIER_2' | 'TIER_3';
  };
  myReaction?: 'LIKE' | 'DISLIKE' | null;
  distanceLabel?: string | null;
  authorHasActiveIntent?: boolean;
  /** Only set on the post-detail response, and only for the author. */
  isOwner?: boolean;
}

interface Props {
  post: Post;
  onReact?: (type: 'LIKE' | 'DISLIKE') => void;
  onConvertToIntent?: () => void;
  compact?: boolean;
}

export function PostCard({ post, onReact, onConvertToIntent, compact }: Props) {
  const router = useRouter();
  const meta = postTypes[post.type] ?? postTypes.MOMENT;

  /**
   * Share is an *outbound* deep link handed to the OS share sheet — there is
   * deliberately no repost anywhere in Daffodils.
   */
  const share = async () => {
    try {
      const { data } = await api.get(`/posts/${post.id}/share`);
      await Share.share({
        message: `${data.data.message}\n\n${data.data.url}`,
        url: data.data.url,
      });
    } catch {
      /* user dismissed the sheet, or the post vanished */
    }
  };

  return (
    <ClayCard style={{ gap: spacing.md }}>
      {/* header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Pressable onPress={() => router.push(`/profile/${post.author.username}`)}>
          <Avatar
            uri={post.author.avatarUrl}
            name={post.author.name}
            size={42}
            ring={post.authorHasActiveIntent}
          />
        </Pressable>

        <View style={{ flex: 1 }}>
          <Pressable onPress={() => router.push(`/profile/${post.author.username}`)}>
            <Text style={type.heading} numberOfLines={1}>
              {post.author.name}
            </Text>
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <Text style={type.caption}>@{post.author.username}</Text>
            <Text style={type.caption}>·</Text>
            <Text style={type.caption}>{timeAgo(post.createdAt)}</Text>
          </View>
        </View>

        <View style={{ alignItems: 'flex-end', gap: 5 }}>
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: radius.pill,
              backgroundColor: meta.soft,
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: '800', color: meta.color }}>
              {meta.emoji} {meta.label}
            </Text>
          </View>
          <DistanceBadge label={post.distanceLabel} />
        </View>
      </View>

      {post.authorHasActiveIntent ? (
        <View style={{ flexDirection: 'row' }}>
          <IntentLiveBadge />
        </View>
      ) : null}

      {/* body */}
      <Pressable onPress={() => router.push(`/post/${post.id}`)}>
        <Text style={type.body}>{post.caption}</Text>
      </Pressable>

      {post.mediaUrls.length > 0 && !compact ? (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: spacing.sm,
            borderRadius: radius.md,
            overflow: 'hidden',
          }}
        >
          {post.mediaUrls.slice(0, 4).map((uri, i) => (
            <Image
              key={`${uri}-${i}`}
              source={{ uri }}
              style={{
                width: post.mediaUrls.length === 1 ? '100%' : '48.5%',
                height: post.mediaUrls.length === 1 ? 220 : 130,
                borderRadius: radius.md,
                backgroundColor: colors.surfaceSunken,
              }}
              accessibilityIgnoresInvertColors
            />
          ))}
        </View>
      ) : null}

      {post.locationName ? (
        <Text style={type.caption}>📍 {post.locationName}</Text>
      ) : null}

      {/* Wishlist → intent, one tap (posts_profile_layer.svg). */}
      {post.type === 'WISHLIST' && onConvertToIntent ? (
        <Pressable
          onPress={onConvertToIntent}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingVertical: 10,
            borderRadius: radius.md,
            backgroundColor: colors.primarySoft,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: '800', color: colors.primaryDeep }}>
            ⚡️ Turn this into a live intent
          </Text>
        </Pressable>
      ) : null}

      {/* reaction bar */}
      <ReactionBar
        post={post}
        onReact={onReact}
        onComment={() => router.push(`/post/${post.id}`)}
        onShare={share}
      />
    </ClayCard>
  );
}

export function ReactionBar({
  post,
  onReact,
  onComment,
  onShare,
}: {
  post: Post;
  onReact?: (t: 'LIKE' | 'DISLIKE') => void;
  onComment: () => void;
  onShare: () => void;
}) {
  const tap = (fn: () => void) => () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    fn();
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingTop: spacing.sm,
        borderTopWidth: 1,
        borderTopColor: colors.borderSoft,
      }}
    >
      <Action
        label={String(post.likeCount)}
        icon={post.myReaction === 'LIKE' ? '💛' : '🤍'}
        active={post.myReaction === 'LIKE'}
        onPress={tap(() => onReact?.('LIKE'))}
      />

      {/* Dislike is a button only — no public count, ever (spec §7). */}
      <Action
        label=""
        icon={post.myReaction === 'DISLIKE' ? '💔' : '🥀'}
        active={post.myReaction === 'DISLIKE'}
        onPress={tap(() => onReact?.('DISLIKE'))}
        accessibilityLabel="Dislike this post"
      />

      <Action label={String(post.commentCount)} icon="💬" onPress={tap(onComment)} />

      <View style={{ flex: 1 }} />

      <Action label="" icon="↗" onPress={tap(onShare)} accessibilityLabel="Share this post" />
    </View>
  );
}

function Action({
  icon,
  label,
  active,
  onPress,
  accessibilityLabel,
}: {
  icon: string;
  label: string;
  active?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: radius.pill,
        backgroundColor: active ? colors.primarySoft : colors.surfaceAlt,
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <Text style={{ fontSize: 14 }}>{icon}</Text>
      {label ? (
        <Text
          style={{
            fontSize: 12,
            fontWeight: '800',
            color: active ? colors.primaryDeep : colors.textMuted,
          }}
        >
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

export default PostCard;
