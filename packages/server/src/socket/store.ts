/**
 * Socket存储模块
 * 管理在线机器和会话的内存状态
 */

import { Server } from 'socket.io';
import { EventEmitter } from 'events';
import {
  OnlineMachineInfo,
  SessionInfo,
  SessionOutputEvent,
  ChatMessageEvent,
} from 'cc-remote-shared';

// Socket.io Server 实例
let _io: Server | null = null;

// 在线机器Map: machineId -> OnlineMachineInfo
export const onlineMachines = new Map<string, OnlineMachineInfo>();

// 会话Map: sessionId -> SessionInfo
export const sessions = new Map<string, SessionInfo>();

// 会话缓冲区Map: sessionId -> SessionOutputEvent[]
export const sessionBuffers = new Map<string, SessionOutputEvent[]>();

// Chat 消息缓冲区Map: sessionId -> ChatMessageEvent[]
export const chatBuffers = new Map<string, ChatMessageEvent[]>();

// Git 响应事件发射器
export const gitResponseEmitter = new EventEmitter();

/**
 * 设置 io 实例
 */
export function setIoInstance(io: Server): void {
  _io = io;
}

/**
 * 获取 io 实例
 */
export function getIoInstance(): Server | null {
  return _io;
}

/**
 * 清理所有存储
 */
export function clearAllStores() {
  onlineMachines.clear();
  sessions.clear();
  sessionBuffers.clear();
  chatBuffers.clear();
}

/**
 * 获取机器的所有活跃会话
 */
export function getMachineSessions(machineId: string): SessionInfo[] {
  return Array.from(sessions.values()).filter(
    session => session.machineId === machineId
  );
}

/**
 * 获取会话的缓冲区
 */
export function getSessionBuffer(sessionId: string): SessionOutputEvent[] {
  return sessionBuffers.get(sessionId) || [];
}
