import { useCallback, useEffect, useState } from 'react';
import { api, unwrap } from '../services/api';
import { config } from '../constants/config';
import { useLocationStore } from '../stores/locationStore';
import type { Post } from '../components/post/PostCard';

interface FeedPage {
  items: Post[];
  nextOffset: number | null;
}

/**
 * Home feed with cursor-less offset paging (the server ranks a fixed window,
 * so an offset is stable enough for infinite scroll and far cheaper than
 * re-ranking per cursor).
 */
export function useFeed() {
  const coords = useLocationStore((s) => s.coords);
  const refreshLocation = useLocationStore((s) => s.refresh);

  const [items, setItems] = useState<Post[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (offset: number, replace: boolean) => {
      const location = coords ?? (await refreshLocation({ push: true }));

      const page = await unwrap<FeedPage>(
        api.get('/posts/feed', {
          params: {
            ...(location ? { lat: location.lat, lng: location.lng } : {}),
            radiusKm: config.feedRadiusKm,
            limit: 20,
            offset,
          },
        })
      );

      setItems((prev) => (replace ? page.items : [...prev, ...page.items]));
      setNextOffset(page.nextOffset);
    },
    [coords, refreshLocation]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await fetchPage(0, true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      await fetchPage(0, true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (nextOffset === null || loadingMore || loading) return;
    setLoadingMore(true);
    try {
      await fetchPage(nextOffset, false);
    } catch {
      /* keep what is already on screen */
    } finally {
      setLoadingMore(false);
    }
  }, [nextOffset, loadingMore, loading, fetchPage]);

  useEffect(() => {
    void load();
    // Intentionally runs once — pull-to-refresh handles later location changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Optimistic like/dislike so the tap feels instant. */
  const react = useCallback(async (postId: string, next: 'LIKE' | 'DISLIKE') => {
    setItems((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        const wasSame = p.myReaction === next;
        const hadLike = p.myReaction === 'LIKE';
        const willLike = !wasSame && next === 'LIKE';
        return {
          ...p,
          myReaction: wasSame ? null : next,
          likeCount: p.likeCount + (willLike ? 1 : 0) - (hadLike ? 1 : 0),
        };
      })
    );

    try {
      const fresh = await unwrap<{ likeCount: number; commentCount: number; myReaction: 'LIKE' | 'DISLIKE' | null }>(
        api.post(`/posts/${postId}/react`, { type: next })
      );
      setItems((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, ...fresh } : p))
      );
    } catch {
      void refresh();
    }
  }, [refresh]);

  return {
    items,
    loading,
    refreshing,
    loadingMore,
    error,
    hasMore: nextOffset !== null,
    refresh,
    loadMore,
    react,
    reload: load,
  };
}
