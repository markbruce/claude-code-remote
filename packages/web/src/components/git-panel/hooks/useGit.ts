import { useState, useCallback } from 'react';
import { apiClient } from '../../../lib/api';
import type { GitStatus, GitCommit } from 'cc-remote-shared';

const GIT_STATUS_DEDUPE_MS = 400;
/** Sidebar 与 GitPanel 各有一套 useGit 实例，用模块级去重避免同一时刻两次 GET /git/status */
const lastGitStatusFetchAtByKey = new Map<string, number>();

export function useGit(machineId?: string, projectPath?: string) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async (opts?: { force?: boolean }) => {
    if (!machineId || !projectPath) return;
    const key = `${machineId}\0${projectPath}`;
    const now = Date.now();
    if (!opts?.force) {
      const last = lastGitStatusFetchAtByKey.get(key) ?? 0;
      if (now - last < GIT_STATUS_DEDUPE_MS) {
        return;
      }
      lastGitStatusFetchAtByKey.set(key, now);
    }
    setIsLoading(true);
    try {
      const data = await apiClient.get<GitStatus>(`/api/machines/${machineId}/git/status`, {
        params: { path: projectPath }
      });
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch git status');
    } finally {
      setIsLoading(false);
    }
  }, [machineId, projectPath]);

  const fetchLog = useCallback(async (limit = 20) => {
    if (!machineId || !projectPath) return;
    try {
      const data = await apiClient.get<GitCommit[]>(`/api/machines/${machineId}/git/log`, {
        params: { path: projectPath, limit }
      });
      setCommits(data);
    } catch (err) {
      console.error('Failed to fetch git log:', err);
    }
  }, [machineId, projectPath]);

  const stage = useCallback(async (file: string) => {
    if (!machineId || !projectPath) return;
    await apiClient.post(`/api/machines/${machineId}/git/stage`, { path: projectPath, file });
    await fetchStatus({ force: true });
  }, [machineId, projectPath, fetchStatus]);

  const unstage = useCallback(async (file: string) => {
    if (!machineId || !projectPath) return;
    await apiClient.post(`/api/machines/${machineId}/git/unstage`, { path: projectPath, file });
    await fetchStatus({ force: true });
  }, [machineId, projectPath, fetchStatus]);

  const commit = useCallback(async (message: string) => {
    if (!machineId || !projectPath) return;
    await apiClient.post(`/api/machines/${machineId}/git/commit`, { path: projectPath, message });
    await fetchStatus({ force: true });
    await fetchLog();
  }, [machineId, projectPath, fetchStatus, fetchLog]);

  return {
    status,
    commits,
    isLoading,
    error,
    fetchStatus,
    fetchLog,
    stage,
    unstage,
    commit,
  };
}
