/**
 * @cc-remote/agent - 会话管理模块
 * 负责管理Claude Code子进程，处理输入输出转发
 * 使用 node-pty 提供伪终端，避免 claude 在无 TTY 时直接退出(exit code 1)
 * 参考: Claude Code UI (https://github.com/siteboon/claudecodeui) 的 Integrated Shell 同样使用 node-pty
 */

import * as fs from 'fs';
import * as path from 'path';
import * as pty from 'node-pty';
import { EventEmitter } from 'events';
import type { IPty } from 'node-pty';
import {
  SessionOutputEvent,
  SessionOptions,
  SESSION_BUFFER_SIZE,
  CLAUDE_CLI_COMMAND,
  CLAUDE_CLI_ARGS,
} from 'cc-remote-shared';

/**
 * 会话状态
 */
export enum SessionState {
  STARTING = 'starting',
  RUNNING = 'running',
  PERMISSION_WAITING = 'permission_waiting',
  ENDING = 'ending',
  ENDED = 'ended',
}

/**
 * 会话配置
 */
export interface SessionConfig {
  /** 会话ID */
  sessionId: string;
  /** 工程路径 */
  projectPath: string;
  /** 会话选项 */
  options?: SessionOptions;
}

/**
 * 会话实例
 */
export class Session extends EventEmitter {
  private config: SessionConfig;
  private process: IPty | null = null;
  private state: SessionState = SessionState.STARTING;
  private outputBuffer: string[] = [];
  private startTime: Date;
  private exitCode: number | null = null;
  private permissionCallback: ((approved: boolean, message?: string) => void) | null = null;

  constructor(config: SessionConfig) {
    super();
    this.config = config;
    this.startTime = new Date();
  }

  /**
   * 启动会话
   */
  async start(): Promise<void> {
    if (this.process) {
      throw new Error('会话已在运行中');
    }

    console.log(`[${this.config.sessionId}] 启动Claude Code会话`);
    console.log(`[${this.config.sessionId}] 工程路径: ${this.config.projectPath}`);

    try {
      // 构建命令参数
      const args = [...CLAUDE_CLI_ARGS];

      // 添加模型选项
      if (this.config.options?.model) {
        args.push('--model', this.config.options.model);
      }

      // 添加额外标志
      if (this.config.options?.extra_flags) {
        args.push(...this.config.options.extra_flags);
      }

      console.log(`[${this.config.sessionId}] 命令: ${CLAUDE_CLI_COMMAND} ${args.join(' ')}`);

      const env = {
        ...process.env,
        CLAUDE_DISABLE_TELEMETRY: '1',
        TERM: 'xterm-256color',
        PATH: process.env.PATH,
      };

      // 解析 cwd 为真实路径
      let cwd: string;
      try {
        cwd = fs.realpathSync(this.config.projectPath);
      } catch {
        cwd = path.resolve(this.config.projectPath);
      }

      // macOS 上 node-pty 的 posix_spawnp 易因 cwd/路径失败，不传 cwd，在 shell 内 cd 再 exec
      const argsEscaped = args.map((a) => (a.includes(' ') || a.includes("'") ? `"${a.replace(/"/g, '\\"')}"` : a)).join(' ');
      const shellCmd = `cd ${JSON.stringify(cwd)} && exec ${CLAUDE_CLI_COMMAND} ${argsEscaped}`;

      console.log(`[${this.config.sessionId}] 完整命令: (cd ${cwd}) ${CLAUDE_CLI_COMMAND} ${args.join(' ')}`);
      console.log(`[${this.config.sessionId}] PATH: ${env.PATH}`);

      const ptyOpts: Record<string, unknown> = {
        env,
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
      };
      const shells: [string, string[]][] = [
        ['/bin/zsh', ['-c', shellCmd]],
        ['/bin/sh', ['-c', shellCmd]],
      ];
      let lastErr: unknown = null;
      for (const [shell, shellArgs] of shells) {
        for (const withCwd of [false, true]) {
          if (withCwd) ptyOpts.cwd = process.env.HOME || '/';
          else delete ptyOpts.cwd;
          try {
            this.process = pty.spawn(shell, shellArgs, ptyOpts as Parameters<typeof pty.spawn>[2]);
            break;
          } catch (e) {
            lastErr = e;
            const msg = e instanceof Error ? e.message : String(e);
            if (!msg.includes('posix_spawnp')) throw e;
          }
        }
        if (this.process) break;
      }
      if (!this.process) {
        const hint =
          'node-pty spawn-helper 可能缺少执行权限，尝试运行: node scripts/fix-node-pty.js';
        const err =
          lastErr instanceof Error ? lastErr : new Error(String(lastErr));
        err.message = `${err.message} — ${hint}`;
        throw err;
      }

      this.state = SessionState.RUNNING;

      this.process.onData((data: string) => {
        this.handleOutput('stdout', data);
      });

      this.process.onExit(({ exitCode, signal }) => {
        this.handleExit(signal && signal > 0 ? 128 + signal : exitCode);
      });

      console.log(`[${this.config.sessionId}] 会话已启动`);
      this.emit('started');
    } catch (error) {
      console.error(`[${this.config.sessionId}] 启动会话失败:`, error);
      this.state = SessionState.ENDED;
      throw error;
    }
  }

  /**
   * 处理输出 -- 原始 chunk 直出，不按行拆分
   */
  private handleOutput(type: 'stdout' | 'stderr', data: string): void {
    this.outputBuffer.push(data);
    if (this.outputBuffer.length > SESSION_BUFFER_SIZE) {
      this.outputBuffer.shift();
    }

    if (this.detectPermissionRequest(data)) {
      this.state = SessionState.PERMISSION_WAITING;
      const event: SessionOutputEvent = {
        session_id: this.config.sessionId,
        type: 'permission_request',
        data,
        timestamp: new Date(),
      };
      this.emit('output', event);
    } else {
      const event: SessionOutputEvent = {
        session_id: this.config.sessionId,
        type: type === 'stdout' ? 'stdout' : 'stderr',
        data,
        timestamp: new Date(),
      };
      this.emit('output', event);
    }
  }

  /**
   * 检测权限请求
   * Claude Code 在需要权限时会显示特定的提示
   */
  private detectPermissionRequest(line: string): boolean {
    // 检测权限请求的关键词
    const permissionKeywords = [
      'Do you want to proceed?',
      'Allow this action?',
      '[Y/n]',
      '[y/N]',
      'Permission required',
      'Do you allow',
      'Would you like to',
    ];

    return permissionKeywords.some(keyword =>
      line.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  /**
   * 处理进程退出
   */
  private handleExit(code: number | null): void {
    this.exitCode = code ?? 0;
    this.state = SessionState.ENDED;

    console.log(`[${this.config.sessionId}] 会话结束，退出码: ${this.exitCode}`);

    this.emit('end', {
      session_id: this.config.sessionId,
      exit_code: this.exitCode,
      ended_at: new Date(),
    });

    // 清理进程
    this.process = null;
  }

  /**
   * 发送输入
   */
  sendInput(data: string): void {
    if (!this.process || this.state === SessionState.ENDED) {
      throw new Error('会话未运行');
    }

    this.process.write(data);
    console.log(`[${this.config.sessionId}] 发送输入: ${data.trim()}`);
  }

  /**
   * 调整终端尺寸
   */
  resize(cols: number, rows: number): void {
    if (this.process && this.state !== SessionState.ENDED) {
      this.process.resize(cols, rows);
      console.log(`[${this.config.sessionId}] 终端 resize: ${cols}x${rows}`);
    }
  }

  /**
   * 回答权限请求
   */
  answerPermission(approved: boolean, message?: string): void {
    if (this.state !== SessionState.PERMISSION_WAITING) {
      console.warn(`[${this.config.sessionId}] 当前没有待处理的权限请求`);
      return;
    }

    // 发送回答（Y/n）
    const answer = approved ? 'Y\n' : 'n\n';
    this.sendInput(answer);

    // 恢复运行状态
    this.state = SessionState.RUNNING;

    console.log(`[${this.config.sessionId}] 权限回答: ${approved ? '允许' : '拒绝'}`);

    this.emit('permission_answered', { approved, message });
  }

  /**
   * 结束会话
   */
  async end(reason?: string): Promise<void> {
    if (!this.process || this.state === SessionState.ENDED) {
      return;
    }

    console.log(`[${this.config.sessionId}] 结束会话: ${reason || '用户请求'}`);
    this.state = SessionState.ENDING;

    const p = this.process;
    this.process = null;

    try {
      p.kill('SIGTERM');

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          try {
            p.kill('SIGKILL');
          } catch {
            // ignore
          }
          resolve();
        }, 5000);
        p.onExit(() => {
          clearTimeout(timeout);
          resolve();
        });
      });
    } catch (error) {
      console.error(`[${this.config.sessionId}] 结束会话失败:`, error);
      try {
        p.kill('SIGKILL');
      } catch {
        // ignore
      }
    }
  }

  /**
   * 获取输出缓冲区
   */
  getOutputBuffer(): string[] {
    return [...this.outputBuffer];
  }

  /**
   * 获取会话状态
   */
  getState(): SessionState {
    return this.state;
  }

  /**
   * 获取会话信息
   */
  getInfo() {
    return {
      sessionId: this.config.sessionId,
      projectPath: this.config.projectPath,
      state: this.state,
      startTime: this.startTime,
      exitCode: this.exitCode,
    };
  }

  /**
   * 会话是否正在运行
   */
  isRunning(): boolean {
    return this.state === SessionState.RUNNING ||
           this.state === SessionState.PERMISSION_WAITING;
  }
}

/**
 * 会话管理器
 */
export class SessionManager extends EventEmitter {
  private sessions: Map<string, Session> = new Map();

  /**
   * 创建新会话
   */
  async createSession(config: SessionConfig): Promise<Session> {
    // 检查是否已存在相同路径的会话
    for (const session of this.sessions.values()) {
      if (session.getInfo().projectPath === config.projectPath && session.isRunning()) {
        console.log(`复用现有会话: ${session.getInfo().sessionId}`);
        return session;
      }
    }

    // 创建新会话
    const session = new Session(config);

    // 转发会话事件
    session.on('output', (event) => this.emit('output', event));
    session.on('end', (event) => {
      this.sessions.delete(event.session_id);
      this.emit('end', event);
    });
    session.on('error', (error) => this.emit('error', error, config.sessionId));

    // 启动会话
    await session.start();

    // 存储会话
    this.sessions.set(config.sessionId, session);

    return session;
  }

  /**
   * 获取会话
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * 结束会话
   */
  async endSession(sessionId: string, reason?: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      await session.end(reason);
      this.sessions.delete(sessionId);
    }
  }

  /**
   * 结束所有会话
   */
  async endAllSessions(): Promise<void> {
    const promises = Array.from(this.sessions.values()).map(session =>
      session.end('服务关闭')
    );
    await Promise.all(promises);
    this.sessions.clear();
  }

  /**
   * 获取所有活动会话
   */
  getActiveSessions(): Session[] {
    return Array.from(this.sessions.values()).filter(s => s.isRunning());
  }

  /**
   * 获取会话数量
   */
  getSessionCount(): number {
    return this.sessions.size;
  }
}

// 导出单例实例
export const sessionManager = new SessionManager();
