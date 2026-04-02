/**
 * 机器列表状态管理
 */

import { create } from 'zustand';
import type { Machine, ProjectInfo, OnlineMachineInfo, AgentStatusEvent, AgentConnectionState } from 'cc-remote-shared';
import { SocketEvents, ONLINE_THRESHOLD } from 'cc-remote-shared';
import { socketManager } from '../lib/socket';

// 机器信息（包含在线状态）
export interface MachineWithStatus extends Machine {
  isOnline: boolean;
  socketId?: string;
}

interface MachinesState {
  // 状态
  machines: MachineWithStatus[];
  onlineMachines: Map<string, OnlineMachineInfo>;
  projects: Map<string, ProjectInfo[]>; // machineId -> projects
  isLoading: boolean;
  isScanning: boolean;
  /** 当前正在扫描的 machineId，用于收到错误时写入空列表以停止重试循环 */
  scanningMachineId: string | null;
  error: string | null;
  selectedMachineId: string | null;
  /** Agent 连接状态 */
  agentConnectionStates: Map<string, AgentConnectionState>;

  // 操作
  setMachines: (machines: Machine[]) => void;
  updateOnlineStatus: (onlineInfo: OnlineMachineInfo[]) => void;
  updateMachineOnlineStatus: (machineId: string, isOnline: boolean, connectionState?: AgentConnectionState) => void;
  setProjects: (machineId: string, projects: ProjectInfo[]) => void;
  selectMachine: (machineId: string | null) => void;
  scanProjects: (machineId: string, forceRefresh?: boolean) => void;
  clearError: () => void;
  reset: () => void;
}

export const useMachinesStore = create<MachinesState>((set, get) => ({
  // 初始状态
  machines: [],
  onlineMachines: new Map(),
  projects: new Map(),
  isLoading: false,
  isScanning: false,
  scanningMachineId: null,
  error: null,
  selectedMachineId: null,
  agentConnectionStates: new Map(),

  // 设置机器列表
  setMachines: (machines: Machine[]) => {
    console.log('[MachinesStore] setMachines called with:', machines.length, 'machines');
    const onlineMachines = get().onlineMachines;
    const machinesWithStatus: MachineWithStatus[] = machines.map((machine) => {
      const onlineInfo = onlineMachines.get(machine.id);
      return {
        ...machine,
        isOnline: !!onlineInfo,
        socketId: onlineInfo?.socketId,
      };
    });
    set({ machines: machinesWithStatus });
  },

  // 更新在线状态
  updateOnlineStatus: (onlineInfo: OnlineMachineInfo[]) => {
    const onlineMap = new Map<string, OnlineMachineInfo>();
    onlineInfo.forEach((info) => {
      onlineMap.set(info.machineId, info);
    });

    const machines = get().machines;
    const machinesWithStatus: MachineWithStatus[] = machines.map((machine) => {
      const info = onlineMap.get(machine.id);
      return {
        ...machine,
        isOnline: !!info,
        socketId: info?.socketId,
      };
    });

    set({
      onlineMachines: onlineMap,
      machines: machinesWithStatus,
    });
  },

  // 更新单个机器的在线状态（用于 Agent 状态变更）
  updateMachineOnlineStatus: (machineId: string, isOnline: boolean, connectionState?: AgentConnectionState) => {
    const machines = get().machines;
    const onlineMachines = new Map(get().onlineMachines);
    const agentConnectionStates = new Map(get().agentConnectionStates);

    // 更新机器列表中的状态
    const machinesWithStatus: MachineWithStatus[] = machines.map((machine) => {
      if (machine.id === machineId) {
        return {
          ...machine,
          isOnline,
          socketId: isOnline ? onlineMachines.get(machineId)?.socketId : undefined,
        };
      }
      return machine;
    });

    // 更新在线机器 map
    if (!isOnline) {
      onlineMachines.delete(machineId);
    }

    // 更新连接状态
    if (connectionState) {
      agentConnectionStates.set(machineId, connectionState);
    }

    set({
      machines: machinesWithStatus,
      onlineMachines,
      agentConnectionStates,
    });
  },

  // 设置工程列表
  setProjects: (machineId: string, projects: ProjectInfo[]) => {
    const projectsMap = new Map(get().projects);
    projectsMap.set(machineId, projects);
    set({ projects: projectsMap, isScanning: false, scanningMachineId: null });
  },

  // 选择机器
  selectMachine: (machineId: string | null) => {
    set({ selectedMachineId: machineId });
  },

  // 扫描工程
  scanProjects: (machineId: string, forceRefresh = false) => {
    set({ isScanning: true, scanningMachineId: machineId, error: null });
    socketManager.scanProjects(machineId, forceRefresh);
  },

  // 清除错误
  clearError: () => {
    set({ error: null });
  },

  // 重置
  reset: () => {
    set({
      machines: [],
      onlineMachines: new Map(),
      projects: new Map(),
      isLoading: false,
      isScanning: false,
      scanningMachineId: null,
      error: null,
      selectedMachineId: null,
      agentConnectionStates: new Map(),
    });
  },
}));

// 检查机器是否在线的辅助函数
export const isMachineOnline = (lastSeen: Date | string | null): boolean => {
  if (!lastSeen) return false;
  const lastSeenDate = typeof lastSeen === 'string' ? new Date(lastSeen) : lastSeen;
  return Date.now() - lastSeenDate.getTime() < ONLINE_THRESHOLD;
};

// 订阅Socket事件
export const subscribeToMachineEvents = (): (() => void) => {
  const unsubscribers: (() => void)[] = [];

  // 机器列表更新
  unsubscribers.push(
    socketManager.on(SocketEvents.MACHINES_LIST, (data: unknown) => {
      console.log('[MachinesStore] MACHINES_LIST event received:', data);
      const typedData = data as { machines: Machine[]; onlineInfo: OnlineMachineInfo[] };
      useMachinesStore.getState().setMachines(typedData.machines || []);
      useMachinesStore.getState().updateOnlineStatus(typedData.onlineInfo || []);
    })
  );

  // 工程列表更新
  unsubscribers.push(
    socketManager.on(SocketEvents.PROJECTS_LIST, (data: unknown) => {
      const typedData = data as { machineId: string; projects: ProjectInfo[] };
      useMachinesStore.getState().setProjects(typedData.machineId, typedData.projects || []);
    })
  );

  // 错误处理：置为未扫描并写入空工程列表，避免「无工程→自动扫描→机器离线→再自动扫描」死循环
  unsubscribers.push(
    socketManager.on(SocketEvents.ERROR, (error: unknown) => {
      const typedError = error as { message: string };
      const state = useMachinesStore.getState();
      const { scanningMachineId } = state;
      const projectsMap = new Map(state.projects);
      if (scanningMachineId) {
        projectsMap.set(scanningMachineId, []);
      }
      useMachinesStore.setState({
        error: typedError.message,
        isScanning: false,
        scanningMachineId: null,
        projects: projectsMap,
      });
    })
  );

  // Agent 状态变更
  unsubscribers.push(
    socketManager.on(SocketEvents.AGENT_STATUS_CHANGED, (data: unknown) => {
      const statusEvent = data as AgentStatusEvent;
      const { machineId, status, connectionState } = statusEvent;
      const isOnline = status === 'online';

      // 更新机器在线状态
      useMachinesStore.getState().updateMachineOnlineStatus(machineId, isOnline, connectionState);

      // 如果 Agent 上线，刷新工程列表（如果该机器是被选中的）
      if (isOnline) {
        const state = useMachinesStore.getState();
        if (state.selectedMachineId === machineId) {
          // 刷新工程列表
          socketManager.scanProjects(machineId, true);
        }
      }

      console.log(`[MachinesStore] Agent status changed: ${machineId} -> ${status} (${connectionState})`);
    })
  );

  // 返回取消订阅函数
  return () => {
    unsubscribers.forEach((unsub) => unsub());
  };
};
