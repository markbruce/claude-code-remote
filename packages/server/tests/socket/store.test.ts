/**
 * Socket存储模块测试
 */

import {
  onlineMachines,
  sessions,
  sessionBuffers,
  clearAllStores,
  getMachineSessions,
  getSessionBuffer
} from '../../src/socket/store';

describe('Socket Store', () => {
  beforeEach(() => {
    clearAllStores();
  });

  afterEach(() => {
    clearAllStores();
  });

  describe('onlineMachines', () => {
    it('should add and get online machine info', () => {
      const machineInfo = {
        machineId: 'machine-1',
        lastSeen: new Date(),
        socketId: 'socket-1'
      };

      onlineMachines.set('machine-1', machineInfo);
      const retrieved = onlineMachines.get('machine-1');

      expect(retrieved).toEqual(machineInfo);
    });

    it('should return undefined for non-existent machine', () => {
      const retrieved = onlineMachines.get('non-existent');
      expect(retrieved).toBeUndefined();
    });

    it('should delete machine info', () => {
      onlineMachines.set('machine-1', {
        machineId: 'machine-1',
        lastSeen: new Date(),
        socketId: 'socket-1'
      });

      onlineMachines.delete('machine-1');
      const retrieved = onlineMachines.get('machine-1');

      expect(retrieved).toBeUndefined();
    });
  });

  describe('sessions', () => {
    it('should add and get session info', () => {
      const sessionInfo = {
        sessionId: 'session-1',
        machineId: 'machine-1',
        projectPath: '/path/to/project',
        startedAt: new Date(),
        clientsCount: 0
      };

      sessions.set('session-1', sessionInfo);
      const retrieved = sessions.get('session-1');

      expect(retrieved).toEqual(sessionInfo);
    });

    it('should return undefined for non-existent session', () => {
      const retrieved = sessions.get('non-existent');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('sessionBuffers', () => {
    it('should add and get session buffer', () => {
      const buffer = [
        { session_id: 'session-1', type: 'stdout' as const, data: 'line 1', timestamp: new Date() },
        { session_id: 'session-1', type: 'stdout' as const, data: 'line 2', timestamp: new Date() }
      ];

      sessionBuffers.set('session-1', buffer);
      const retrieved = sessionBuffers.get('session-1');

      expect(retrieved).toEqual(buffer);
    });

    it('should return empty array for non-existent session', () => {
      const retrieved = getSessionBuffer('non-existent');
      expect(retrieved).toEqual([]);
    });
  });

  describe('clearAllStores', () => {
    it('should clear all stores', () => {
      onlineMachines.set('machine-1', {
        machineId: 'machine-1',
        lastSeen: new Date(),
        socketId: 'socket-1'
      });

      sessions.set('session-1', {
        sessionId: 'session-1',
        machineId: 'machine-1',
        projectPath: '/path',
        startedAt: new Date(),
        clientsCount: 0
      });

      sessionBuffers.set('session-1', []);

      clearAllStores();

      expect(onlineMachines.size).toBe(0);
      expect(sessions.size).toBe(0);
      expect(sessionBuffers.size).toBe(0);
    });
  });

  describe('getMachineSessions', () => {
    it('should get all sessions for a machine', () => {
      sessions.set('session-1', {
        sessionId: 'session-1',
        machineId: 'machine-1',
        projectPath: '/path1',
        startedAt: new Date(),
        clientsCount: 0
      });

      sessions.set('session-2', {
        sessionId: 'session-2',
        machineId: 'machine-1',
        projectPath: '/path2',
        startedAt: new Date(),
        clientsCount: 0
      });

      sessions.set('session-3', {
        sessionId: 'session-3',
        machineId: 'machine-2',
        projectPath: '/path3',
        startedAt: new Date(),
        clientsCount: 0
      });

      const machineSessions = getMachineSessions('machine-1');

      expect(machineSessions.length).toBe(2);
      expect(machineSessions.map(s => s.sessionId)).toContain('session-1');
      expect(machineSessions.map(s => s.sessionId)).toContain('session-2');
      expect(machineSessions.map(s => s.sessionId)).not.toContain('session-3');
    });
  });

  describe('getSessionBuffer', () => {
    it('should get buffer for existing session', () => {
      const buffer = [
        { session_id: 'session-1', type: 'stdout' as const, data: 'line 1', timestamp: new Date() }
      ];
      sessionBuffers.set('session-1', buffer);

      const retrieved = getSessionBuffer('session-1');
      expect(retrieved).toEqual(buffer);
    });

    it('should return empty array for non-existent session', () => {
      const retrieved = getSessionBuffer('non-existent');
      expect(retrieved).toEqual([]);
    });
  });
});
