import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Small secrets the user gives us (their Zotero API key). Android/iOS use the
 * OS keystore; the web falls back to localStorage, which the settings screen
 * says plainly.
 */
export const secretsAreDeviceProtected = Platform.OS !== 'web';

export async function getSecret(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

export async function setSecret(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Storage blocked (private mode): the key lives for this session only.
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function deleteSecret(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // nothing stored
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
