import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Tokens go in the device keychain/keystore. SecureStore has no web backend,
 * so web falls back to AsyncStorage — acceptable for the Expo web preview,
 * never for a shipped web build.
 */
const ACCESS = 'daffodils.accessToken';
const REFRESH = 'daffodils.refreshToken';
const DEVICE = 'daffodils.deviceId';

const isWeb = Platform.OS === 'web';

async function read(key: string): Promise<string | null> {
  try {
    return isWeb ? AsyncStorage.getItem(key) : await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function write(key: string, value: string) {
  try {
    if (isWeb) await AsyncStorage.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    /* storage unavailable — the session simply won't persist */
  }
}

async function remove(key: string) {
  try {
    if (isWeb) await AsyncStorage.removeItem(key);
    else await SecureStore.deleteItemAsync(key);
  } catch {
    /* ignore */
  }
}

export async function getTokens() {
  const [accessToken, refreshToken] = await Promise.all([read(ACCESS), read(REFRESH)]);
  return { accessToken, refreshToken };
}

export async function setTokens(tokens: { accessToken: string; refreshToken: string }) {
  await Promise.all([
    write(ACCESS, tokens.accessToken),
    write(REFRESH, tokens.refreshToken),
  ]);
}

export async function clearTokens() {
  await Promise.all([remove(ACCESS), remove(REFRESH)]);
}

/** Stable per-install id — the server keys refresh-token rotation on it. */
export async function getDeviceId(): Promise<string> {
  const existing = await read(DEVICE);
  if (existing) return existing;

  const id = `dev-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
  await write(DEVICE, id);
  return id;
}
