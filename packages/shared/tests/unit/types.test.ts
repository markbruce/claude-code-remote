/**
 * Shared模块类型测试
 */

import {
  User,
  Machine
  Project
  SessionLog
  HTTP_STATUS
  ERROR_MESSAGES
  SocketEvents
  SocketNamespaces
  HEARTBEAT_INTERVAL
  ONLINE_THRESHOLD
  SESSION_BUFFER_SIZE
  DEFAULT_SERVER_PORT
  DEFAULT_WEB_PORT
  CLAUDE_CLI_COMMAND
  CLAUDE_CLI_ARGS
  ENV_VARS
} from '../../src/index';

describe('Shared Types', () => {
  it('should export User interface', () => {
      expect(User).toBeDefined();
      const user: User = {
        id: 'user-123',
        email: 'test@example.com'
      };
      expect(user.email).toBe('test@example.com');
    });

    it('should export Machine interface', () => {
      expect(Machine).toBeDefined();
      const machine: Machine = {
        id: 'machine-123',
        user_id: 'user-123',
        name: 'Test Machine',
        hostname: 'test-host',
      };
      expect(machine.name).toBe('Test Machine');
    });

    it('should export Project interface', () => {
      expect(Project).toBeDefined();
      const project: Project = {
        id: 'project-123',
        machine_id: 'machine-123',
        path: '/test/path',
        name: 'Test Project'
      };
      expect(project.name).toBe('Test Project');
    });
  });

  it('should export SessionLog interface', () => {
      expect(SessionLog).toBeDefined();
    });
  });
  });

  it('should export HTTP_STATUS constants', () => {
      expect(HTTP_STATUS.OK).toBe(200);
      expect(HTTP_STATUS.CREATED).toBe(201);
      expect(HTTP_STATUS.BAD_REQUEST).toBe(400);
    });
  });

  it('should export SocketEvents constants', () => {
      expect(SocketEvents.AACH).toBeDefined();
      expect(SocketEvents.AGENT_PING).toBe('agent:ping');
      expect(SocketEvents.AGENT_PONG).toBe('agent:pong');
      expect(SocketEvents.SCAN_PROJECTS).toBe('scan-projects');
      expect(SocketEvents.PROJECTS_LIST).toBe('projects:list');
    });
  });

  it('should export SocketNamespaces', () => {
      expect(SocketNamespaces.AGENT).toBe('/agent');
      expect(SocketNamespaces.CLIENT).toBe('/client');
    });
  });

  it('should export heartbeat and session constants', () => {
      expect(HEARTBEAT_INTERVAL).toBe(25000);
      expect(ONLINE_THRESHOLD).toBe(60000);
      expect(SESSION_BUFFER_SIZE).toBe(200);
    });
  });
});
