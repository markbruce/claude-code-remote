/**
 * CC Remote - Socket Store
 * Manages Socket.io connection and real-time communication
 */

import { create } from 'zustand';
import { io, type Socket } from 'socket.io-client';
import { SocketNamespaces, SocketEvents } from 'cc-remote-shared';
import { useAuthStore } from './auth';
import { getStoredApiUrl } from './auth';

interface SocketState {
  agentSocket: Socket | null;
  clientSocket: Socket | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  emit: (event: string, data: unknown) => void;
  on: (event: string, callback: (...args: unknown[]) => void) => void;
  off: (event: string, callback?: (...args: unknown[]) => void) => void;
}

export const useSocketStore = create<SocketState>((set, get) => ({
  agentSocket: null,
  clientSocket: null,
  isConnected: false,
  isConnecting: false,
  error: null,

  connect: async () => {
    const { agentSocket, clientSocket, isConnecting } = get();

    if (agentSocket?.connected || clientSocket?.connected || isConnecting) {
      return;
    }

    set({ isConnecting: true, error: null });

    try {
      const token = useAuthStore.getState().token;
      const apiUrl = await getStoredApiUrl();

      if (!token || !apiUrl) {
        throw new Error('No authentication token or API URL found');
      }

      // Parse URL to get WebSocket address
      const wsUrl = apiUrl.replace(/^https?:\/\//, '').replace(/\/api$/, '');
      const protocol = apiUrl.startsWith('https') ? 'wss' : 'ws';
      const socketUrl = `${protocol}://${wsUrl}`;

      // Create client namespace socket
      const client = io(`${socketUrl}${SocketNamespaces.CLIENT}`, {
        auth: { token },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000,
      });

      client.on('connect', () => {
        set({ isConnected: true, isConnecting: false, error: null });
      });

      client.on('disconnect', (reason) => {
        set({ isConnected: false });
        if (reason === 'io server disconnect') {
          // Server initiated disconnect, need to reconnect manually
          client.connect();
        }
      });

      client.on('connect_error', (error) => {
        set({ error: error.message, isConnecting: false });
      });

      // Listen for agent status changes
      client.on(SocketEvents.AGENT_STATUS_CHANGED, (data) => {
        // Will be handled by machines store
        const { addOnlineMachine, removeOnlineMachine } = require('./machines').useMachinesStore.getState();
        if (data.status === 'online') {
          addOnlineMachine(data.machineId);
        } else {
          removeOnlineMachine(data.machineId);
        }
      });

      set({ clientSocket: client });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Connection failed',
        isConnecting: false,
      });
    }
  },

  disconnect: () => {
    const { agentSocket, clientSocket } = get();
    agentSocket?.disconnect();
    clientSocket?.disconnect();
    set({
      agentSocket: null,
      clientSocket: null,
      isConnected: false,
    });
  },

  emit: (event: string, data: unknown) => {
    const { clientSocket } = get();
    clientSocket?.emit(event, data);
  },

  on: (event: string, callback: (...args: unknown[]) => void) => {
    const { clientSocket } = get();
    clientSocket?.on(event, callback);
  },

  off: (event: string, callback?: (...args: unknown[]) => void) => {
    const { clientSocket } = get();
    if (callback) {
      clientSocket?.off(event, callback);
    } else {
      clientSocket?.off(event);
    }
  },
}));
