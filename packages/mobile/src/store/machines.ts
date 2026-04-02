/**
 * CC Remote - Machines Store
 * Manages connected machines and their states
 */

import { create } from 'zustand';
import type { Machine } from 'cc-remote-shared';

interface MachineWithStatus extends Machine {
  isOnline: boolean;
  lastSeenTime?: number;
}

interface MachinesState {
  machines: MachineWithStatus[];
  onlineMachines: Set<string>;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchMachines: (getToken: () => string | null, getApiUrl: () => Promise<string | null>) => Promise<void>;
  addMachine: (machine: Machine) => void;
  updateMachine: (id: string, updates: Partial<MachineWithStatus>) => void;
  removeMachine: (id: string) => void;

  // Online status tracking
  addOnlineMachine: (machineId: string) => void;
  removeOnlineMachine: (machineId: string) => void;
  getMachineById: (id: string) => MachineWithStatus | undefined;
  getOnlineMachines: () => MachineWithStatus[];
}

export const useMachinesStore = create<MachinesState>((set, get) => ({
  machines: [],
  onlineMachines: new Set<string>(),
  isLoading: false,
  error: null,

  fetchMachines: async (getToken, getApiUrl) => {
    set({ isLoading: true, error: null });
    try {
      const token = getToken();
      const apiUrl = await getApiUrl();

      if (!token || !apiUrl) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${apiUrl}/api/machines`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch machines');
      }

      const machines: Machine[] = await response.json();

      const machinesWithStatus = machines.map((m) => ({
        ...m,
        isOnline: get().onlineMachines.has(m.id),
        lastSeenTime: m.last_seen?.getTime(),
      }));

      set({ machines: machinesWithStatus, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch machines',
        isLoading: false,
      });
    }
  },

  addMachine: (machine: Machine) => {
    set((state) => ({
      machines: [
        ...state.machines,
        { ...machine, isOnline: state.onlineMachines.has(machine.id) },
      ],
    }));
  },

  updateMachine: (id: string, updates: Partial<MachineWithStatus>) => {
    set((state) => ({
      machines: state.machines.map((m) =>
        m.id === id ? { ...m, ...updates } : m
      ),
    }));
  },

  removeMachine: (id: string) => {
    set((state) => ({
      machines: state.machines.filter((m) => m.id !== id),
      onlineMachines: new Set([...state.onlineMachines].filter((mid) => mid !== id)),
    }));
  },

  addOnlineMachine: (machineId: string) => {
    set((state) => {
      const newOnlineMachines = new Set(state.onlineMachines).add(machineId);
      return {
        onlineMachines: newOnlineMachines,
        machines: state.machines.map((m) =>
          m.id === machineId ? { ...m, isOnline: true } : m
        ),
      };
    });
  },

  removeOnlineMachine: (machineId: string) => {
    set((state) => {
      const newOnlineMachines = new Set(state.onlineMachines);
      newOnlineMachines.delete(machineId);
      return {
        onlineMachines: newOnlineMachines,
        machines: state.machines.map((m) =>
          m.id === machineId ? { ...m, isOnline: false } : m
        ),
      };
    });
  },

  getMachineById: (id: string) => {
    return get().machines.find((m) => m.id === id);
  },

  getOnlineMachines: () => {
    return get().machines.filter((m) => m.isOnline);
  },
}));
