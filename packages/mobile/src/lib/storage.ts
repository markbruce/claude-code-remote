/**
 * CC Remote - Secure Storage Utilities
 * Wrapper around Expo SecureStore for sensitive data
 */

import * as SecureStore from 'expo-secure-store';

// Storage keys
const TOKEN_KEY = 'cc_remote_auth_token';
const API_URL_KEY = 'cc_remote_api_url';
const USER_KEY = 'cc_remote_user';

/**
 * Save authentication token to secure storage
 * @param token - JWT token to store
 * @throws Error if save fails
 */
export async function saveToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

/**
 * Get authentication token from secure storage
 * @returns Token string or null if not found
 */
export async function getToken(): Promise<string | null> {
  return await SecureStore.getItemAsync(TOKEN_KEY);
}

/**
 * Remove authentication token from secure storage
 */
export async function removeToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

/**
 * Save server URL to secure storage
 * @param url - Server base URL
 * @throws Error if save fails
 */
export async function saveServerUrl(url: string): Promise<void> {
  await SecureStore.setItemAsync(API_URL_KEY, url);
}

/**
 * Get server URL from secure storage
 * @returns Server URL string or null if not found
 */
export async function getServerUrl(): Promise<string | null> {
  return await SecureStore.getItemAsync(API_URL_KEY);
}

/**
 * Remove server URL from secure storage
 */
export async function removeServerUrl(): Promise<void> {
  await SecureStore.deleteItemAsync(API_URL_KEY);
}

/**
 * Save user data to secure storage
 * @param user - User object as JSON string
 * @throws Error if save fails
 */
export async function saveUser(user: object): Promise<void> {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

/**
 * Get user data from secure storage
 * @returns Parsed user object or null if not found
 */
export async function getUser<T = unknown>(): Promise<T | null> {
  const userJson = await SecureStore.getItemAsync(USER_KEY);
  if (!userJson) {
    return null;
  }
  try {
    return JSON.parse(userJson) as T;
  } catch {
    return null;
  }
}

/**
 * Remove user data from secure storage
 */
export async function removeUser(): Promise<void> {
  await SecureStore.deleteItemAsync(USER_KEY);
}

/**
 * Clear all stored authentication data
 * Removes token, server URL, and user data
 */
export async function clearAuthData(): Promise<void> {
  await Promise.all([
    removeToken(),
    removeServerUrl(),
    removeUser(),
  ]);
}

/**
 * Check if user is authenticated (has valid token and server URL)
 * @returns true if both token and server URL exist
 */
export async function isAuthenticated(): Promise<boolean> {
  const [token, serverUrl] = await Promise.all([
    getToken(),
    getServerUrl(),
  ]);
  return !!(token && serverUrl);
}

/**
 * Save a custom key-value pair to secure storage
 * @param key - Storage key
 * @param value - Value to store
 */
export async function setItem(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value);
}

/**
 * Get a value from secure storage by key
 * @param key - Storage key
 * @returns Value or null if not found
 */
export async function getItem(key: string): Promise<string | null> {
  return await SecureStore.getItemAsync(key);
}

/**
 * Remove a value from secure storage by key
 * @param key - Storage key
 */
export async function removeItem(key: string): Promise<void> {
  await SecureStore.deleteItemAsync(key);
}

/**
 * Check if SecureStore is available on this device
 * @returns true if SecureStore is supported
 */
export async function isSecureStoreAvailable(): Promise<boolean> {
  try {
    await SecureStore.isAvailableAsync();
    return true;
  } catch {
    return false;
  }
}
