import * as Location from 'expo-location';
import { create } from 'zustand';
import { api } from '../services/api';
import { config } from '../constants/config';

interface Coords {
  lat: number;
  lng: number;
}

interface LocationState {
  coords: Coords | null;
  permission: 'undetermined' | 'granted' | 'denied';
  error: string | null;
  lastPushedAt: number;
  requestPermission: () => Promise<boolean>;
  refresh: (opts?: { push?: boolean }) => Promise<Coords | null>;
  push: (coords: Coords) => Promise<void>;
}

export const useLocationStore = create<LocationState>((set, get) => ({
  coords: null,
  permission: 'undetermined',
  error: null,
  lastPushedAt: 0,

  requestPermission: async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    const granted = status === 'granted';
    set({ permission: granted ? 'granted' : 'denied' });
    return granted;
  },

  refresh: async ({ push = true } = {}) => {
    try {
      let { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        ({ status } = await Location.requestForegroundPermissionsAsync());
      }
      if (status !== 'granted') {
        set({ permission: 'denied', error: 'Location permission denied' });
        return null;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coords = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };

      set({ coords, permission: 'granted', error: null });
      if (push) await get().push(coords);
      return coords;
    } catch (err) {
      set({ error: (err as Error).message });
      return null;
    }
  },

  /**
   * Server-side location has a 5-minute Redis TTL, so it must be refreshed
   * while the app is in use — but not on every screen mount.
   */
  push: async (coords) => {
    const since = Date.now() - get().lastPushedAt;
    if (since < config.locationUpdateIntervalMs) return;

    try {
      await api.post('/users/me/location', coords);
      set({ lastPushedAt: Date.now() });
    } catch {
      /* a dropped location update is not worth surfacing to the user */
    }
  },
}));
