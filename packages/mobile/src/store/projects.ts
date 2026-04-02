/**
 * CC Remote - Projects Store
 * Manages projects available on connected machines
 */

import { create } from 'zustand';
import type { Project } from 'cc-remote-shared';
import { SocketEvents } from 'cc-remote-shared';

interface ProjectState extends Project {
  machineId: string;
  machineName?: string;
}

interface ProjectsState {
  projectsByMachine: Record<string, ProjectState[]>;
  isLoading: boolean;
  isScanning: boolean;
  error: string | null;
  currentScanRequestId: string | null;

  // Actions
  fetchProjects: (machineId: string, getToken: () => string | null, getApiUrl: () => Promise<string | null>, forceRefresh?: boolean) => Promise<void>;
  scanProjects: (machineId: string, emit: (event: string, data: unknown) => void, on: (event: string, callback: (...args: unknown[]) => void) => void, off: (event: string, callback?: (...args: unknown[]) => void) => void, forceRefresh?: boolean) => void;
  setProjects: (machineId: string, projects: ProjectState[]) => void;
  addProject: (machineId: string, project: ProjectState) => void;
  removeProject: (machineId: string, projectId: string) => void;
  getProjectsByMachine: (machineId: string) => ProjectState[];
  clearProjects: (machineId: string) => void;
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projectsByMachine: {},
  isLoading: false,
  isScanning: false,
  error: null,
  currentScanRequestId: null,

  fetchProjects: async (machineId: string, getToken, getApiUrl, forceRefresh = false) => {
    set({ isLoading: true, error: null });
    try {
      const token = getToken();
      const apiUrl = await getApiUrl();

      if (!token || !apiUrl) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${apiUrl}/api/machines/${machineId}/projects${forceRefresh ? '?refresh=true' : ''}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch projects');
      }

      const projects: Project[] = await response.json();

      const projectsWithMachine = projects.map((p) => ({
        ...p,
        machineId,
      }));

      set((state) => ({
        projectsByMachine: {
          ...state.projectsByMachine,
          [machineId]: projectsWithMachine,
        },
        isLoading: false,
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch projects',
        isLoading: false,
      });
    }
  },

  scanProjects: (machineId: string, emit, on, off, forceRefresh = false) => {
    const requestId = `scan_${Date.now()}`;
    set({ isScanning: true, currentScanRequestId: requestId });

    const request = {
      machine_id: machineId,
      force_refresh: forceRefresh,
      request_id: requestId,
    };

    emit(SocketEvents.SCAN_PROJECTS, request);

    // Set up listener for this specific request
    const handleProjectsList = (data: { machine_id: string; projects: unknown[]; request_id?: string }) => {
      if (data.request_id === requestId && data.machine_id === machineId) {
        const projects = data.projects as Array<{ path: string; name: string; last_accessed?: Date }>;
        const projectsWithMachine = projects.map((p) => ({
          ...p,
          id: p.id || `${machineId}-${p.path}`,
          machine_id: machineId,
          last_scanned: new Date(),
        }) as Project);

        set((state) => ({
          projectsByMachine: {
            ...state.projectsByMachine,
            [machineId]: projectsWithMachine.map((p) => ({
              ...p,
              machineId,
            })),
          },
          isScanning: false,
          currentScanRequestId: null,
        }));

        off(SocketEvents.PROJECTS_LIST, handleProjectsList);
      }
    };

    on(SocketEvents.PROJECTS_LIST, handleProjectsList);

    // Timeout after 30 seconds
    setTimeout(() => {
      if (get().currentScanRequestId === requestId) {
        set({ isScanning: false, currentScanRequestId: null });
        off(SocketEvents.PROJECTS_LIST, handleProjectsList);
      }
    }, 30000);
  },

  setProjects: (machineId: string, projects: ProjectState[]) => {
    set((state) => ({
      projectsByMachine: {
        ...state.projectsByMachine,
        [machineId]: projects,
      },
    }));
  },

  addProject: (machineId: string, project: ProjectState) => {
    set((state) => {
      const existing = state.projectsByMachine[machineId] || [];
      return {
        projectsByMachine: {
          ...state.projectsByMachine,
          [machineId]: [...existing, project],
        },
      };
    });
  },

  removeProject: (machineId: string, projectId: string) => {
    set((state) => {
      const existing = state.projectsByMachine[machineId] || [];
      return {
        projectsByMachine: {
          ...state.projectsByMachine,
          [machineId]: existing.filter((p) => p.id !== projectId),
        },
      };
    });
  },

  getProjectsByMachine: (machineId: string) => {
    return get().projectsByMachine[machineId] || [];
  },

  clearProjects: (machineId: string) => {
    set((state) => {
      const updated = { ...state.projectsByMachine };
      delete updated[machineId];
      return { projectsByMachine: updated };
    });
  },
}));
