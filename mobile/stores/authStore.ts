import { create } from 'zustand';
import { api, unwrap } from '../services/api';
import { clearTokens, getDeviceId, getTokens, setTokens } from '../services/tokenStore';
import { connectSocket, disconnectSocket } from '../services/socket';

export interface Me {
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
  phoneVerified: boolean;
  phone?: string | null;
  email?: string | null;
  postCount?: number;
  createdAt: string;
  trustedContact?: { id: string; name: string; phone: string; relation: string | null } | null;
}

interface AuthState {
  user: Me | null;
  status: 'loading' | 'authenticated' | 'anonymous';
  hydrate: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  register: (input: {
    phone?: string;
    email?: string;
    password: string;
    name: string;
    username: string;
    city?: string;
    phoneProofToken?: string;
  }) => Promise<void>;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: Me) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  status: 'loading',

  /** Runs once at boot: a stored refresh token means we can restore a session. */
  hydrate: async () => {
    const { accessToken, refreshToken } = await getTokens();
    if (!accessToken && !refreshToken) {
      set({ status: 'anonymous', user: null });
      return;
    }
    try {
      const user = await unwrap<Me>(api.get('/users/me'));
      set({ user, status: 'authenticated' });
      await connectSocket();
    } catch {
      await clearTokens();
      set({ status: 'anonymous', user: null });
    }
  },

  login: async (identifier, password) => {
    const deviceId = await getDeviceId();
    const data = await unwrap<{ user: Me; accessToken: string; refreshToken: string }>(
      api.post('/auth/login', { identifier, password, deviceId })
    );
    await setTokens(data);
    set({ user: data.user, status: 'authenticated' });
    await connectSocket();
  },

  register: async (input) => {
    const deviceId = await getDeviceId();
    const data = await unwrap<{ user: Me; accessToken: string; refreshToken: string }>(
      api.post('/auth/register', { ...input, deviceId })
    );
    await setTokens(data);
    set({ user: data.user, status: 'authenticated' });
    await connectSocket();
  },

  refreshUser: async () => {
    if (get().status !== 'authenticated') return;
    try {
      const user = await unwrap<Me>(api.get('/users/me'));
      set({ user });
    } catch {
      /* keep the cached user rather than blanking the UI on a transient error */
    }
  },

  logout: async () => {
    const { refreshToken } = await getTokens();
    if (refreshToken) {
      await api.post('/auth/logout', { refreshToken }).catch(() => undefined);
    }
    disconnectSocket();
    await clearTokens();
    set({ user: null, status: 'anonymous' });
  },

  setUser: (user) => set({ user }),
}));
