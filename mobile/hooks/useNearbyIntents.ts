import { useCallback, useEffect, useState } from 'react';
import { api, unwrap } from '../services/api';
import { useLocationStore } from '../stores/locationStore';
import type { Intent } from '../components/intent/IntentCard';
import type { VibeKey } from '../constants/theme';

export function useNearbyIntents(radiusKm = 10) {
  const coords = useLocationStore((s) => s.coords);
  const refreshLocation = useLocationStore((s) => s.refresh);

  const [intents, setIntents] = useState<Intent[]>([]);
  const [vibeFilter, setVibeFilter] = useState<VibeKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** "Skip" dismisses an intent from this session's list only (spec §6). */
  const [skipped, setSkipped] = useState<Set<string>>(new Set());

  const fetch = useCallback(
    async (isRefresh = false) => {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError(null);
      try {
        const location = coords ?? (await refreshLocation());
        if (!location) {
          setError('Location is needed to show intents around you');
          setIntents([]);
          return;
        }

        const data = await unwrap<Intent[]>(
          api.get('/intents/nearby', {
            params: {
              lat: location.lat,
              lng: location.lng,
              radiusKm,
              ...(vibeFilter ? { vibeTag: vibeFilter } : {}),
            },
          })
        );
        setIntents(data);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [coords, refreshLocation, radiusKm, vibeFilter]
  );

  useEffect(() => {
    void fetch();
  }, [fetch]);

  const skip = useCallback((id: string) => {
    setSkipped((prev) => new Set(prev).add(id));
  }, []);

  return {
    intents: intents.filter((i) => !skipped.has(i.id)),
    loading,
    refreshing,
    error,
    vibeFilter,
    setVibeFilter,
    refresh: () => fetch(true),
    skip,
    coords,
  };
}
