import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../../../lib/api';
import type { FileNode } from '../types';

export function useFileTree(rootPath: string, machineId?: string) {
  const [tree, setTree] = useState<FileNode | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTree = useCallback(async (path: string) => {
    if (!machineId) return null;
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<FileNode>(`/api/machines/${machineId}/files`, {
        params: { path }
      });
      setTree(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch files');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [machineId]);

  useEffect(() => {
    if (rootPath) {
      fetchTree(rootPath);
    }
  }, [rootPath, fetchTree]);

  return { tree, isLoading, error, fetchTree };
}
