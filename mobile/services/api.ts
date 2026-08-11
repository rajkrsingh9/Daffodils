import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { API_URL } from '../constants/config';
import { getTokens, setTokens, clearTokens } from './tokenStore';

export const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 20_000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (cfg) => {
  const { accessToken } = await getTokens();
  if (accessToken) cfg.headers.Authorization = `Bearer ${accessToken}`;
  return cfg;
});

/**
 * Access tokens live 15 minutes, so a 401 mid-session is routine rather than
 * exceptional. One refresh runs at a time and every request that raced into a
 * 401 waits on that same promise — otherwise N parallel requests would each
 * rotate the refresh token and invalidate one another.
 */
let refreshing: Promise<string | null> | null = null;
let onAuthLost: (() => void) | null = null;

export function setAuthLostHandler(fn: () => void) {
  onAuthLost = fn;
}

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken } = await getTokens();
  if (!refreshToken) return null;

  try {
    const res = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
    const { accessToken, refreshToken: rotated } = res.data.data;
    await setTokens({ accessToken, refreshToken: rotated });
    return accessToken;
  } catch {
    await clearTokens();
    onAuthLost?.();
    return null;
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError<{ error?: { code?: string; message?: string } }>) => {
    const original = error.config as InternalAxiosRequestConfig & { _retried?: boolean };
    const code = error.response?.data?.error?.code;

    const isAuthRoute = original?.url?.includes('/auth/');
    if (error.response?.status === 401 && !original?._retried && !isAuthRoute) {
      original._retried = true;

      refreshing = refreshing ?? refreshAccessToken().finally(() => {
        refreshing = null;
      });
      const token = await refreshing;

      if (token) {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      }
      if (code === 'REFRESH_TOKEN_REUSED') onAuthLost?.();
    }

    return Promise.reject(error);
  }
);

/** Unwraps the `{ data: ... }` envelope every endpoint returns. */
export async function unwrap<T>(promise: Promise<{ data: { data: T } }>): Promise<T> {
  const res = await promise;
  return res.data.data;
}

/** Turns an Axios failure into the server's human-readable message. */
export function apiError(err: unknown): string {
  const axiosErr = err as AxiosError<{ error?: { message?: string; details?: unknown } }>;
  const payload = axiosErr.response?.data?.error;

  if (payload?.details && Array.isArray(payload.details)) {
    const first = payload.details[0] as { message?: string } | undefined;
    if (first?.message) return first.message;
  }
  if (payload?.message) return payload.message;
  if (axiosErr.code === 'ECONNABORTED') return 'The request timed out. Check your connection.';
  if (axiosErr.message === 'Network Error') {
    return 'Cannot reach the server. Is the API running?';
  }
  return axiosErr.message ?? 'Something went wrong';
}

export function apiErrorCode(err: unknown): string | undefined {
  return (err as AxiosError<{ error?: { code?: string } }>).response?.data?.error?.code;
}
