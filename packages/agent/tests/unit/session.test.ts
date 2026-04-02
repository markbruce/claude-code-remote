/**
 * 会话管理模块测试
 */

import { EventEmitter } from 'events';
import { Session, SessionManager, SessionState, SessionConfig } from '../../src/session';

// Mock child_process
jest.mock('child_process', () => ({
  spawn: jest.fn()
}));

describe('Session', () => {
  let session: Session;
  let mockProcess: {
    stdout: { on: jest.fn(), emit: jest.fn() },
    stderr: { on: jest.fn(), emit: jest.fn() },
    stdin: { write: jest.fn(), end: jest.fn() },
    on: jest.fn(),
    kill: jest.fn()
  };
  let defaultConfig: SessionConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    defaultConfig = {
      sessionId: 'test-session-1',
      projectPath: '/test/project'
    };
    session = new Session(defaultConfig);

    // Mock the spawn function
    const spawnMock = require('child_process').spawn as jest.Mock;
    spawnMock.mockReturnValue(mockProcess as any);
  });

  describe('start', () => {
    it('should start a session successfully', async () => {
      await session.start();

      expect(session.getState()).toBe(SessionState.RUNNING);
      expect(spawnMock).toHaveBeenCalled();
    });

    it('should throw error if already running', async () => {
      await session.start();

      await expect(session.start()).rejects('会话已在运行中');
    });
  });

  describe('handleOutput', () => {
    beforeEach(async () => {
      await session.start();
    });

    it('should handle stdout', () => {
      const outputSpy = jest.spyOn(session, 'emit');
      const handler = (session as any).process?.stdout?.on as jest.Mock;
      handler.call handlers.output;
      const callback = handler.mock.calls[0][0];
      // Simulate stdout data
      const callback = (session as any).process?.stdout?.on as jest.Mock;
      if (callback) {
        callback({ data: Buffer.from('test output\n') });
      }
      expect(outputSpy).toHaveBeenCalledWith('output', expect.objectContaining({
        session_id: 'test-session-1',
        type: 'stdout'
      }));
    });

    it('should limit buffer size', async () => {
      await session.start();
      const outputSpy = jest.spyOn(session, 'emit');
      const handler = (session as any).process?.stdout?.on as jest.Mock;
      // Add more than 200 lines
      for (let i = 0; i < 250; i++) {
        if (handler) {
          handler({ data: Buffer.from(`line ${i}\n`) });
        }
      }
      const buffer = session.getOutputBuffer();
      expect(buffer.length).toBe(200);
    });
  });

  describe('sendInput', () => {
    beforeEach(async () => {
      await session.start();
    });

    it('should send input to process stdin', () => {
      session.sendInput('test input\n');

      expect(mockProcess.stdin.write).toHaveBeenCalledWith('test input\n');
    });

    it('should throw error if session not running', () => {
      session.end();

      expect(() => session.sendInput('test')).toThrow('会话未运行');
    });
  });

  describe('answerPermission', () => {
    beforeEach(async () => {
      await session.start();
      // Set state to permission waiting
      Object.defineProperty(session, 'state', { value: SessionState.PERMISSION_WAITING });
    });

    it('should approve permission', () => {
      session.answerPermission(true);

      expect(mockProcess.stdin.write).toHaveBeenCalledWith('Y\n');
      expect(session.getState()).toBe(SessionState.RUNNING);
    });

    it('should deny permission', () => {
      session.answerPermission(false);

      expect(mockProcess.stdin.write).toHaveBeenCalledWith('n\n');
    });
  });

  describe('getOutputBuffer', () => {
    it('should return copy of buffer', async () => {
      await session.start();
      const handler = (session as any).process?.stdout?.on as jest.Mock;

      // Add some output
      if (handler) {
        handler({ data: Buffer.from('line 1\n') });
        handler({ data: Buffer.from('line 2\n') });
      }

      const buffer = session.getOutputBuffer();
      expect(buffer).toContain('line 1');
      expect(buffer).toContain('line 2');
    });
  });

  describe('isRunning', () => {
    it('should return true when running', async () => {
      await session.start();
      expect(session.isRunning()).toBe(true);
    });

    it('should return true when permission waiting', async () => {
      await session.start();
      Object.defineProperty(session, 'state', { value: SessionState.PERMISSION_WAITING });
      expect(session.isRunning()).toBe(true);
    });

    it('should return false when ended', async () => {
      await session.start();
      await session.end();
      expect(session.isRunning()).toBe(false);
    });
  });
});

describe('SessionManager', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager();
  });

  describe('createSession', () => {
    it('should create and start a new session', async () => {
      const session = await sessionManager.createSession({
        sessionId: 'new-session',
        projectPath: '/test/project'
      });

      expect(session).toBeDefined();
      expect(sessionManager.getSession('new-session')).toBe(session);
    });
  });

  describe('getSession', () => {
    it('should return session if exists', async () => {
      await sessionManager.createSession({
        sessionId: 'test-session',
        projectPath: '/test/project'
      });

      const session = sessionManager.getSession('test-session');
      expect(session).toBeDefined();
    });

    it('should return undefined if not exists', () => {
      const session = sessionManager.getSession('non-existent');
      expect(session).toBeUndefined();
    });
  });

  describe('getSessionCount', () => {
    it('should return correct count', async () => {
      expect(sessionManager.getSessionCount()).toBe(0);

      await sessionManager.createSession({
        sessionId: 'session-1',
        projectPath: '/test/project1'
      });

      expect(sessionManager.getSessionCount()).toBe(1);

      await sessionManager.createSession({
        sessionId: 'session-2',
        projectPath: '/test/project2'
      });

      expect(sessionManager.getSessionCount()).toBe(2);
    });
  });

  describe('getActiveSessions', () => {
    it('should return only active sessions', async () => {
      await sessionManager.createSession({
        sessionId: 'active-session',
        projectPath: '/test/project'
      });

      const sessions = sessionManager.getActiveSessions();
      expect(sessions.length).toBe(1);
    });
  });
});
