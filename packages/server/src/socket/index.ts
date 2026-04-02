/**
 * Socket.io模块入口
 * 导出所有Socket相关功能
 */

import { Server } from 'socket.io';
import { SocketNamespaces } from 'cc-remote-shared';
import { setIoInstance } from './store';
import { agentAuthMiddleware, handleAgentConnection } from './agent.socket';
import { clientAuthMiddleware, handleClientConnection } from './client.socket';

/**
 * 初始化Socket.io服务器
 * 配置Agent和Client命名空间
 */
export function initSocketServer(io: Server): void {
  // 保存 io 实例供跨命名空间通信使用
  setIoInstance(io);

  // Agent命名空间
  const agentNamespace = io.of(SocketNamespaces.AGENT);
  agentNamespace.use(agentAuthMiddleware);
  agentNamespace.on('connection', handleAgentConnection);

  console.log('[Socket] Agent namespace initialized at /agent');

  // Client命名空间
  const clientNamespace = io.of(SocketNamespaces.CLIENT);
  clientNamespace.use(clientAuthMiddleware);
  clientNamespace.on('connection', handleClientConnection);

  console.log('[Socket] Client namespace initialized at /client');
}

// 导出存储和工具函数
export { onlineMachines, sessions, sessionBuffers, clearAllStores, getMachineSessions, getSessionBuffer, getIoInstance } from './store';
export { isMachineOnline, getOnlineMachineInfo, getOnlineMachineIds } from './agent.socket';
