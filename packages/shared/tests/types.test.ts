/**
 * Shared模块测试
 */

import { User, Machine, Project, SessionLog } from '../src/types';
import { SocketEvents, HTTP_STATUS, ERROR_MESSAGES } from '../src/constants';

describe('Shared Module Tests', () => {
  describe('Types', () => {
    it('should have User type', () => {
      const user: User = {
        id: 'user-1',
        email: 'test@example.com',
        created_at: new Date()
      };
      expect(user.id).toBeDefined();
    });

    it('should have Machine type', () => {
      const machine: Machine = {
        id: 'machine-1',
        user_id: 'user-1',
        name: 'Test Machine',
        hostname: 'test-host',
        created_at: new Date()
      };
      expect(machine.id).toBeDefined();
    });

    it('should have Project type', () => {
      const project: Project = {
        id: 'project-1',
        machine_id: 'machine-1',
        path: '/test/path',
        name: 'Test Project',
        last_scanned: new Date()
      };
      expect(project.id).toBeDefined();
    });

    it('should have SessionLog type', () => {
      const session: SessionLog = {
        id: 'session-1',
        machine_id: 'machine-1',
        started_at: new Date()
      };
      expect(session.id).toBeDefined();
    });
  });

  describe('Constants', () => {
    it('should have SocketEvents', () => {
      expect(SocketEvents.AGENT_PING).toBe('agent:ping');
      expect(SocketEvents.AGENT_PONG).toBe('agent:pong');
      expect(SocketEvents.SCAN_PROJECTS).toBe('scan-projects');
      expect(SocketEvents.PROJECTS_LIST).toBe('projects:list');
      expect(SocketEvents.START_SESSION).toBe('start-session');
      expect(SocketEvents.SESSION_STARTED).toBe('session-started');
      expect(SocketEvents.ERROR).toBe('error');
    });

    it('should have HTTP_STATUS', () => {
      expect(HTTP_STATUS.OK).toBe(200);
      expect(HTTP_STATUS.CREATED).toBe(201);
      expect(HTTP_STATUS.BAD_REQUEST).toBe(400);
      expect(HTTP_STATUS.UNAUTHORIZED).toBe(401);
      expect(HTTP_STATUS.NOT_FOUND).toBe(404);
      expect(HTTP_STATUS.INTERNAL_ERROR).toBe(500);
    });

    it('should have ERROR_MESSAGES', () => {
      expect(ERROR_MESSAGES.UNAUTHORIZED).toBe('未授权访问');
      expect(ERROR_MESSAGES.INVALID_TOKEN).toBe('无效的令牌');
      expect(ERROR_MESSAGES.MACHINE_NOT_FOUND).toBe('机器不存在');
      expect(ERROR_MESSAGES.SESSION_NOT_FOUND).toBe('会话不存在');
    });
  });
});
