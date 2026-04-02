/**
 * Socket 连接状态管理
 * 解决 React StrictMode 导致的重复连接问题
 */

import { create } from 'zustand';
import { socketManager } from '../lib/socket';
import i18n from '../i18n';
import { subscribeToMachineEvents } from './machinesStore';
import { subscribeToSessionEvents } from './sessionStore';
import { subscribeToChatEvents } from './chatStore';

interface SocketState {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  connect: (serverUrl: string, token: string) => Promise<void>;
  disconnect: () => void;
}

let unsubMachines: (() => void) | null = null;
let unsubSessions: (() => void) | null = null;
let unsubChat: (() => void) | null = null;
let connectionPromise: Promise<void> | null = null;

export const useSocketStore = create<SocketState>((set, get) => ({
  isConnected: false,
  isConnecting: false,
  error: null,

  connect: async (serverUrl: string, token: string) => {
    // 如果已经连接，直接返回
    if (get().isConnected) {
      console.log('[SocketStore] 已经连接，跳过');
      return;
    }

    // 如果正在连接，等待现有连接完成
    if (connectionPromise) {
      console.log('[SocketStore] 等待现有连接完成...');
      await connectionPromise;
      return;
    }

    set({ isConnecting: true, error: null });

    connectionPromise = (async () => {
      try {
        // 先订阅事件（只订阅一次）
        if (!unsubMachines) {
          unsubMachines = subscribeToMachineEvents();
        }
        if (!unsubSessions) {
          unsubSessions = subscribeToSessionEvents();
        }
        if (!unsubChat) {
          unsubChat = subscribeToChatEvents();
        }

        // 连接 socket
        // 优先使用环境变量配置的服务地址，否则使用传入的 serverUrl
        const socketUrl =
          import.meta.env.VITE_SERVER_URL || serverUrl;

        if (!socketManager.isConnected()) {
          await socketManager.connect({
            url: socketUrl,
            token,
          });
        }

        console.log('[SocketStore] 连接成功');
        set({ isConnected: true, isConnecting: false });
      } catch (error) {
        console.error('[SocketStore] 连接失败:', error);
        set({
          error: error instanceof Error ? error.message : i18n.t('errors.connectionFailed'),
          isConnecting: false,
          isConnected: false
        });
      } finally {
        connectionPromise = null;
      }
    })();

    await connectionPromise;
  },

  disconnect: () => {
    if (unsubMachines) {
      unsubMachines();
      unsubMachines = null;
    }
    if (unsubSessions) {
      unsubSessions();
      unsubSessions = null;
    }
    if (unsubChat) {
      unsubChat();
      unsubChat = null;
    }
    socketManager.disconnect();
    connectionPromise = null;
    set({ isConnected: false, isConnecting: false });
  },
}));
