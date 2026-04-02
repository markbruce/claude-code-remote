/**
 * Socket连接管理Hook
 */

import { useEffect, useRef, useCallback } from 'react';
import { socketManager } from '../lib/socket';
import { useAuthStore } from '../stores';
import { SocketEvents } from 'cc-remote-shared';

interface UseSocketOptions {
  autoConnect?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

export const useSocket = (options: UseSocketOptions = {}) => {
  const { autoConnect = true, onConnect, onDisconnect, onError } = options;
  const { token, isAuthenticated } = useAuthStore();
  const isConnectedRef = useRef(false);

  // 连接Socket
  const connect = useCallback(async () => {
    if (!token || !isAuthenticated) {
      return;
    }

    if (socketManager.isConnected()) {
      return;
    }

    try {
      // 优先使用环境变量配置的服务地址，否则使用当前页面的 origin
      const serverUrl =
        import.meta.env.VITE_SERVER_URL || window.location.origin;
      await socketManager.connect({
        url: serverUrl,
        token,
      });
      isConnectedRef.current = true;
      onConnect?.();
    } catch (error) {
      onError?.(error as Error);
    }
  }, [token, isAuthenticated, onConnect, onError]);

  // 断开连接
  const disconnect = useCallback(() => {
    socketManager.disconnect();
    isConnectedRef.current = false;
    onDisconnect?.();
  }, [onDisconnect]);

  // 自动连接
  useEffect(() => {
    if (autoConnect && token && isAuthenticated) {
      connect();
    }

    return () => {
      // 可选：在组件卸载时断开连接
      // disconnect();
    };
  }, [autoConnect, token, isAuthenticated, connect]);

  // 监听断开事件
  useEffect(() => {
    const unsubDisconnect = socketManager.on('disconnect', () => {
      isConnectedRef.current = false;
      onDisconnect?.();
    });

    return () => {
      unsubDisconnect();
    };
  }, [onDisconnect]);

  return {
    isConnected: socketManager.isConnected(),
    socketId: socketManager.getId(),
    connect,
    disconnect,
  };
};

/**
 * 订阅Socket事件的Hook
 */
export const useSocketEvent = <T = unknown>(
  event: string,
  callback: (data: T) => void,
  deps: React.DependencyList = []
) => {
  const callbackRef = useRef(callback);

  // 更新回调引用
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // 订阅事件
  useEffect(() => {
    const unsubscribe = socketManager.on(event, (data) => {
      callbackRef.current(data as T);
    });

    return () => {
      unsubscribe();
    };
  }, [event, ...deps]);
};

/**
 * 机器事件订阅Hook
 */
export const useMachineEvents = () => {
  const eventHandlers = useRef<{
    onMachinesList?: (data: unknown) => void;
    onProjectsList?: (data: unknown) => void;
    onError?: (error: unknown) => void;
  }>({});

  useEffect(() => {
    const unsubscribers: (() => void)[] = [];

    if (eventHandlers.current.onMachinesList) {
      unsubscribers.push(
        socketManager.on(SocketEvents.MACHINES_LIST, eventHandlers.current.onMachinesList)
      );
    }

    if (eventHandlers.current.onProjectsList) {
      unsubscribers.push(
        socketManager.on(SocketEvents.PROJECTS_LIST, eventHandlers.current.onProjectsList)
      );
    }

    if (eventHandlers.current.onError) {
      unsubscribers.push(
        socketManager.on(SocketEvents.ERROR, eventHandlers.current.onError)
      );
    }

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, []);

  return {
    setOnMachinesList: (handler: (data: unknown) => void) => {
      eventHandlers.current.onMachinesList = handler;
    },
    setOnProjectsList: (handler: (data: unknown) => void) => {
      eventHandlers.current.onProjectsList = handler;
    },
    setOnError: (handler: (error: unknown) => void) => {
      eventHandlers.current.onError = handler;
    },
  };
};
