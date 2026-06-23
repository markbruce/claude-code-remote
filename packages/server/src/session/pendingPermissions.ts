/**
 * Tracks pending permission requests for first-approval-wins.
 * A request id resolves exactly once; later attempts return false.
 */
export function createPendingPermissions() {
  const resolved = new Set<string>();

  return {
    /** Returns true if this call is the first resolution (winner). */
    tryResolve(id: string): boolean {
      if (resolved.has(id)) return false;
      resolved.add(id);
      return true;
    },
    isResolved(id: string): boolean {
      return resolved.has(id);
    },
    clear(id: string): void {
      resolved.delete(id);
    },
    size(): number {
      return resolved.size;
    },
  };
}
