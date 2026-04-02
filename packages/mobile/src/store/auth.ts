/**
 * CC Remote - Auth Store
 * Manages authentication state and user session
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';
import type { User, LoginRequest, LoginResponse } from 'cc-remote-shared';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (request: LoginRequest, serverUrl: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
}

const API_URL_KEY = 'cc_remote_api_url';
const TOKEN_KEY = 'cc_remote_auth_token';

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,

  login: async (request: LoginRequest, serverUrl: string) => {
    set({ isLoading: true });
    try {
      const response = await fetch(`${serverUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error('Login failed');
      }

      const data: LoginResponse = await response.json();

      // Store token securely
      await SecureStore.setItemAsync(TOKEN_KEY, data.token);
      await SecureStore.setItemAsync(API_URL_KEY, serverUrl);

      set({
        user: data.user,
        token: data.token,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(API_URL_KEY);
    set({
      user: null,
      token: null,
      isAuthenticated: false,
    });
  },

  setUser: (user) => set({ user }),
  setToken: (token) => set({ token }),
}));

// Helper to get stored API URL
export const getStoredApiUrl = async (): Promise<string | null> => {
  return await SecureStore.getItemAsync(API_URL_KEY);
};

// Helper to get stored token
export const getStoredToken = async (): Promise<string | null> => {
  return await SecureStore.getItemAsync(TOKEN_KEY);
};

// Initialize auth state from secure storage on app start
export const initializeAuth = async (): Promise<void> => {
  const token = await getStoredToken();
  if (token) {
    // Token exists, validate it by fetching user info
    const apiUrl = await getStoredApiUrl();
    if (apiUrl) {
      try {
        const response = await fetch(`${apiUrl}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const user: User = await response.json();
          useAuthStore.getState().setUser(user);
          useAuthStore.getState().setToken(token);
          useAuthStore.setState({ isAuthenticated: true });
        }
      } catch {
        // Token invalid, clear it
        await SecureStore.deleteItemAsync(TOKEN_KEY);
      }
    }
  }
};
