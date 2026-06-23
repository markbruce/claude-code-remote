/**
 * Shared模块类型测试
 */

import {
  User,
  Machine,
  Project,
  SessionLog,
  HTTP_STATUS,
  ERROR_MESSAGES,
  SocketEvents,
  SocketNamespaces,
  HEARTBEAT_INTERVAL,
  ONLINE_THRESHOLD,
  SESSION_BUFFER_SIZE,
  DEFAULT_SERVER_PORT,
  DEFAULT_WEB_PORT,
  CLAUDE_CLI_COMMAND,
  CLAUDE_CLI_ARGS,
  ENV_VARS,
} from '../../src/index';

describe('Shared Types', () => {
  it('should export User interface', () => {
    const user: User = {
      id: 'user-123',
      email: 'test@example.com',
      created_at: new Date(),
    };
    expect(user.email).toBe('test@example.com');
  });

  it('should export Machine interface', () => {
    const machine: Machine = {
      id: 'machine-123',
      user_id: 'user-123',
      name: 'Test Machine',
      hostname: 'test-host',
      created_at: new Date(),
    };
    expect(machine.name).toBe('Test Machine');
  });

  it('should export Project interface', () => {
    const project: Project = {
      id: 'project-123',
      machine_id: 'machine-123',
      path: '/test/path',
      name: 'Test Project',
      last_scanned: new Date(),
    };
    expect(project.name).toBe('Test Project');
  });

  it('should export SessionLog interface', () => {
    const session: SessionLog = {
      id: 'session-123',
      machine_id: 'machine-123',
      started_at: new Date(),
    };
    expect(session.id).toBe('session-123');
  });

  it('should export HTTP_STATUS constants', () => {
    expect(HTTP_STATUS.OK).toBe(200);
    expect(HTTP_STATUS.CREATED).toBe(201);
    expect(HTTP_STATUS.BAD_REQUEST).toBe(400);
  });

  it('should export SocketEvents constants', () => {
    expect(SocketEvents.AGENT_PING).toBe('agent:ping');
    expect(SocketEvents.AGENT_PONG).toBe('agent:pong');
    expect(SocketEvents.SCAN_PROJECTS).toBe('scan-projects');
    expect(SocketEvents.PROJECTS_LIST).toBe('projects:list');
  });

  it('should define Phase 2 socket events', () => {
    expect(SocketEvents.INVITE_CREATE).toBe('invite:create');
    expect(SocketEvents.INVITE_CREATED).toBe('invite:created');
    expect(SocketEvents.PARTICIPANTS).toBe('participants');
    expect(SocketEvents.CHAT_PERMISSION_RESOLVED).toBe('chat:permission-resolved');
  });

  it('should export SocketNamespaces', () => {
    expect(SocketNamespaces.AGENT).toBe('/agent');
    expect(SocketNamespaces.CLIENT).toBe('/client');
  });

  it('should export heartbeat and session constants', () => {
    expect(HEARTBEAT_INTERVAL).toBe(25000);
    expect(ONLINE_THRESHOLD).toBe(60000);
    expect(SESSION_BUFFER_SIZE).toBe(200);
  });
});
