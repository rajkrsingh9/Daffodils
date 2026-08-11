import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Avatar,
  Badge,
  ClayCard,
  DistanceBadge,
  EmptyState,
  IntentLiveBadge,
  TagChip,
  TrustBadge,
  timeAgo,
} from '../shared';
import { PostCard, type Post } from '../post/PostCard';
import { clayEdge, colors, radius, shadows, spacing, type } from '../../constants/theme';
import { api, unwrap } from '../../services/api';

export interface Profile {
  id: string;
  name: string;
  username: string;
  city: string | null;
  bio: string | null;
  avatarUrl: string | null;
  interestTags: string[];
  trustTier: 'TIER_1' | 'TIER_2' | 'TIER_3';
  trustScore: string | number;
  activitiesDone: number;
  companionsMet: number;
  faceVerified: boolean;
  createdAt: string;
  postCount?: number;
  ratingCount?: number;
  activeIntent?: { id: string; title: string } | null;
  distanceLabel?: string | null;
  sharedInterests?: string[];
  sharedActivities?: number;
  isSelf?: boolean;
}

interface Activity {
  id: string;
  status: string;
  completedAt: string | null;
  createdAt: string;
  intent: {
    id: string;
    title: string;
    activityEmoji: string;
    locationName: string;
    scheduledAt: string;
  };
  partner: { id: string; name: string; username: string; avatarUrl: string | null };
}

interface Review {
  id: string;
  score: number;
  review: string | null;
  createdAt: string;
  rater: { name: string; username: string; avatarUrl: string | null };
  match: { intent: { title: string; activityEmoji: string } };
}

type TabKey = 'posts' | 'activity' | 'reviews';

export function ProfileView({
  profile,
  isSelf,
  header,
  onReact,
}: {
  profile: Profile;
  isSelf: boolean;
  header?: React.ReactNode;
  onReact?: (postId: string, type: 'LIKE' | 'DISLIKE') => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>('posts');

  const [posts, setPosts] = useState<Post[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTab = useCallback(
    async (key: TabKey) => {
      setLoading(true);
      try {
        if (key === 'posts') {
          const data = await unwrap<{ items: Post[] }>(
            isSelf
              ? api.get('/posts/me')
              : api.get(`/posts/user/${profile.username}`)
          );
          setPosts(data.items);
        } else if (key === 'activity') {
          setActivity(await unwrap<Activity[]>(api.get(`/users/${profile.username}/activity`)));
        } else {
          setReviews(await unwrap<Review[]>(api.get(`/users/${profile.username}/reviews`)));
        }
      } catch {
        /* the empty state covers it */
      } finally {
        setLoading(false);
      }
    },
    [isSelf, profile.username]
  );

  useEffect(() => {
    void loadTab(tab);
  }, [tab, loadTab]);

  const stats = [
    { label: 'Companions', value: profile.companionsMet },
    { label: 'Activities', value: profile.activitiesDone },
    {
      label: 'Avg rating',
      value: Number(profile.trustScore) > 0 ? Number(profile.trustScore).toFixed(1) : '—',
    },
    { label: 'Posts', value: profile.postCount ?? posts.length },
  ];

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: spacing.xxl * 2 }}
      showsVerticalScrollIndicator={false}
    >
      {header}

      {/* ── header card ─────────────────────────────────────────────── */}
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
        <ClayCard style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', gap: spacing.lg, alignItems: 'center' }}>
            <Avatar
              uri={profile.avatarUrl}
              name={profile.name}
              size={78}
              ring={Boolean(profile.activeIntent)}
            />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={type.title} numberOfLines={1}>
                {profile.name}
              </Text>
              <Text style={type.caption}>@{profile.username}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
                {profile.city ? <Text style={type.caption}>📍 {profile.city}</Text> : null}
                <DistanceBadge label={profile.distanceLabel} />
              </View>
              <TrustBadge tier={profile.trustTier} score={profile.trustScore} />
            </View>
          </View>

          {profile.bio ? <Text style={type.body}>{profile.bio}</Text> : null}

          {profile.activeIntent ? (
            <Pressable onPress={() => router.push(`/intent/${profile.activeIntent!.id}`)}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.sm,
                  padding: spacing.md,
                  borderRadius: radius.md,
                  backgroundColor: colors.mintSoft,
                }}
              >
                <IntentLiveBadge />
                <Text style={[type.caption, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                  {profile.activeIntent.title}
                </Text>
                <Text style={{ color: colors.success, fontWeight: '800' }}>›</Text>
              </View>
            </Pressable>
          ) : null}

          {profile.interestTags.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {profile.interestTags.map((t) => {
                const shared = profile.sharedInterests?.includes(t);
                return shared ? (
                  <Badge key={t} label={t} color={colors.primaryDeep} soft={colors.primarySoft} />
                ) : (
                  <TagChip key={t} label={t} />
                );
              })}
            </View>
          ) : null}

          {!isSelf && profile.sharedActivities ? (
            <Text style={[type.caption, { color: colors.success, fontWeight: '800' }]}>
              You've done {profile.sharedActivities} activit
              {profile.sharedActivities === 1 ? 'y' : 'ies'} together
            </Text>
          ) : null}
        </ClayCard>

        {/* ── stats row ─────────────────────────────────────────────── */}
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {stats.map((s) => (
            <View
              key={s.label}
              style={[
                {
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: spacing.md,
                  borderRadius: radius.md,
                  backgroundColor: colors.surface,
                },
                shadows.claySm,
                clayEdge,
              ]}
            >
              <Text style={[type.heading, { fontSize: 17 }]}>{s.value}</Text>
              <Text style={[type.caption, { fontSize: 10 }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* ── tab switcher ──────────────────────────────────────────── */}
        <View
          style={{
            flexDirection: 'row',
            backgroundColor: colors.surfaceSunken,
            borderRadius: radius.pill,
            padding: 4,
          }}
        >
          {(
            [
              ['posts', 'Posts'],
              ['activity', 'Activity'],
              ['reviews', 'Reviews'],
            ] as [TabKey, string][]
          ).map(([key, label]) => (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityState={{ selected: tab === key }}
              onPress={() => setTab(key)}
              style={[
                {
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: 9,
                  borderRadius: radius.pill,
                  backgroundColor: tab === key ? colors.surface : 'transparent',
                },
                tab === key ? shadows.claySm : undefined,
              ]}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '800',
                  color: tab === key ? colors.text : colors.textFaint,
                }}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* ── tab body ────────────────────────────────────────────────── */}
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        {loading ? (
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primaryDeep} />
        ) : tab === 'posts' ? (
          posts.length ? (
            posts.map((p) => (
              <PostCard key={p.id} post={p} onReact={(t) => onReact?.(p.id, t)} />
            ))
          ) : (
            <EmptyState
              emoji="📭"
              title={isSelf ? 'You haven’t posted yet' : 'No posts yet'}
              body={
                isSelf
                  ? 'Posts are how people get a sense of you before agreeing to meet.'
                  : undefined
              }
            />
          )
        ) : tab === 'activity' ? (
          activity.length ? (
            activity.map((a) => <ActivityRow key={a.id} activity={a} />)
          ) : (
            <EmptyState emoji="🗓" title="No activities yet" />
          )
        ) : reviews.length ? (
          reviews.map((r) => <ReviewCard key={r.id} review={r} />)
        ) : (
          <EmptyState
            emoji="⭐️"
            title="No reviews yet"
            body="Reviews appear after a completed activity."
          />
        )}
      </View>
    </ScrollView>
  );
}

function ActivityRow({ activity }: { activity: Activity }) {
  const router = useRouter();
  const done = activity.status === 'COMPLETED';

  return (
    <Pressable onPress={() => router.push(`/profile/${activity.partner.username}`)}>
      <ClayCard depth="sm" style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Text style={{ fontSize: 24 }}>{activity.intent.activityEmoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={type.heading} numberOfLines={1}>
              {activity.intent.title}
            </Text>
            <Text style={type.caption}>
              📍 {activity.intent.locationName} ·{' '}
              {new Date(activity.intent.scheduledAt).toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </Text>
          </View>
          <Badge
            label={activity.status}
            color={done ? colors.success : colors.textFaint}
            soft={done ? colors.mintSoft : colors.surfaceSunken}
          />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Avatar uri={activity.partner.avatarUrl} name={activity.partner.name} size={24} />
          <Text style={type.caption}>with {activity.partner.name}</Text>
        </View>
      </ClayCard>
    </Pressable>
  );
}

function ReviewCard({ review }: { review: Review }) {
  return (
    <ClayCard depth="sm" style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Avatar uri={review.rater.avatarUrl} name={review.rater.name} size={36} />
        <View style={{ flex: 1 }}>
          <Text style={[type.body, { fontWeight: '700' }]}>{review.rater.name}</Text>
          <Text style={type.caption}>
            {review.match.intent.activityEmoji} {review.match.intent.title} ·{' '}
            {timeAgo(review.createdAt)}
          </Text>
        </View>
        <Text style={{ fontSize: 14, fontWeight: '800', color: colors.primaryDeep }}>
          {'★'.repeat(review.score)}
          <Text style={{ color: colors.borderSoft }}>{'★'.repeat(5 - review.score)}</Text>
        </Text>
      </View>
      {review.review ? <Text style={type.body}>“{review.review}”</Text> : null}
    </ClayCard>
  );
}

export default ProfileView;
