/**
 * Permission manager — handles tool permission requests with timeout
 */

export interface PendingPermission {
  sessionId: string;
  requestId: string;
  chatId: string;
  toolName: string;
  description: string;
  timer: NodeJS.Timeout;
  createdAt: number;
}

export class PermissionManager {
  private pending = new Map<number, PendingPermission>();  // callbackKey → pending
  private lookup = new Map<string, number>();               // requestId → callbackKey
  private nextKey = 0;
  private onTimeout?: (requestId: string, sessionId: string, chatId: string) => void;

  setOnTimeout(handler: (requestId: string, sessionId: string, chatId: string) => void): void {
    this.onTimeout = handler;
  }

  /**
   * Register a pending permission request.
   * Returns a short callback key for Telegram Inline Keyboard (≤64 bytes).
   */
  register(sessionId: string, requestId: string, chatId: string, toolName: string, description: string, timeoutMs: number = 300000): number {
    const key = this.nextKey++;
    const timer = setTimeout(() => {
      this.pending.delete(key);
      this.lookup.delete(requestId);
      this.onTimeout?.(requestId, sessionId, chatId);
    }, timeoutMs);

    const entry: PendingPermission = { sessionId, requestId, chatId, toolName, description, timer, createdAt: Date.now() };
    this.pending.set(key, entry);
    this.lookup.set(requestId, key);
    return key;
  }

  /**
   * Resolve a permission request by callback key.
   * Returns the pending request info, or undefined if expired/unknown.
   */
  resolve(callbackKey: number, approved: boolean): PendingPermission | undefined {
    const entry = this.pending.get(callbackKey);
    if (!entry) return undefined;

    clearTimeout(entry.timer);
    this.pending.delete(callbackKey);
    this.lookup.delete(entry.requestId);
    return entry;
  }

  /** Get pending request by callback key (without resolving) */
  get(callbackKey: number): PendingPermission | undefined {
    return this.pending.get(callbackKey);
  }
}
