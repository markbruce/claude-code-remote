/**
 * @cc-remote/agent - SDK 会话管理模块
 * 使用 @anthropic-ai/claude-agent-sdk 的 query() 实现 Chat 模式
 * 支持流式消息、工具调用、权限审批和会话恢复
 */

import { EventEmitter } from 'events';
import { query, listSessions, getSessionMessages } from '@anthropic-ai/claude-agent-sdk';
import type {
  SDKMessage,
  SDKUserMessage,
  Options,
  PermissionResult,
  Query,
} from '@anthropic-ai/claude-agent-sdk';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { execSync } from 'child_process';
import type {
  ChatMessageEvent,
  SessionOptions,
  SessionHistoryItem,
  HistoryMessage,
} from 'cc-remote-shared';

export enum SdkSessionState {
  STARTING = 'starting',
  RUNNING = 'running',
  ENDED = 'ended',
}

export interface SdkSessionConfig {
  sessionId: string;
  projectPath: string;
  options?: SessionOptions;
  initialPrompt?: string;
  resumeSdkSessionId?: string;
}

/**
 * 基于 Promise 的异步消息队列，作为 SDK streaming input 的 async generator
 */
class MessageQueue {
  private queue: SDKUserMessage[] = [];
  private waitResolve: ((value: IteratorResult<SDKUserMessage>) => void) | null = null;
  private closed = false;

  push(msg: SDKUserMessage): void {
    if (this.closed) return;
    if (this.waitResolve) {
      const resolve = this.waitResolve;
      this.waitResolve = null;
      resolve({ value: msg, done: false });
    } else {
      this.queue.push(msg);
    }
  }

  close(): void {
    this.closed = true;
    if (this.waitResolve) {
      const resolve = this.waitResolve;
      this.waitResolve = null;
      resolve({ value: undefined as unknown as SDKUserMessage, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: (): Promise<IteratorResult<SDKUserMessage>> => {
        if (this.queue.length > 0) {
          return Promise.resolve({ value: this.queue.shift()!, done: false });
        }
        if (this.closed) {
          return Promise.resolve({ value: undefined as unknown as SDKUserMessage, done: true });
        }
        return new Promise((resolve) => {
          this.waitResolve = resolve;
        });
      },
    };
  }
}

type PermissionResolver = (result: PermissionResult) => void;

/**
 * SDK 会话实例
 * 通过 Agent SDK 的 query() 与 Claude 交互，转发结构化消息
 */
export class SdkSession extends EventEmitter {
  private config: SdkSessionConfig;
  private state: SdkSessionState = SdkSessionState.STARTING;
  private messageQueue = new MessageQueue();
  private sdkSessionId: string | null = null;
  private queryInstance: Query | null = null;
  private abortController = new AbortController();
  private pendingPermissions = new Map<string, PermissionResolver>();
  private startTime: Date;

  constructor(config: SdkSessionConfig) {
    super();
    this.config = config;
    this.startTime = new Date();
  }

  /**
   * 动态检测 Claude Code 可执行文件路径
   * 支持 macOS Homebrew 和 Linux npm 全局安装
   */
  private getClaudeExecutablePath(): string {
    // 优先级1: 检查 macOS Homebrew 路径
    const homebrewPath = '/opt/homebrew/lib/node_modules/@anthropic-ai/claude-code/cli.js';
    if (existsSync(homebrewPath)) {
      return homebrewPath;
    }

    // 优先级2: 检查 Linux npm 全局安装路径 (nvm)
    const possiblePaths = [
      // nvm 安装路径（动态检测）
      ...this.getNvmClaudePaths(),
      // 常见全局安装路径
      '/usr/lib/node_modules/@anthropic-ai/claude-code/cli.js',
      '/usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js',
    ];

    for (const p of possiblePaths) {
      if (existsSync(p)) {
        return p;
      }
    }

    // 优先级3: 尝试通过 which 命令查找
    try {
      const whichResult = execSync('which claude', { encoding: 'utf-8' }).trim();
      if (whichResult) {
        // which 返回的是 bin 目录下的符号链接，需要找到实际的 cli.js
        const binPath = whichResult;
        const libPath = binPath.replace('/bin/claude', '/lib/node_modules/@anthropic-ai/claude-code/cli.js');
        if (existsSync(libPath)) {
          return libPath;
        }
        // 如果 lib 路径不存在，尝试直接使用 bin 路径
        return binPath;
      }
    } catch {
      // which 命令失败，忽略
    }

    // 默认：不指定路径，让 SDK 自己查找
    console.warn('[SdkSession] Could not find claude executable, using SDK default');
    return undefined as unknown as string;
  }

  /**
   * 获取 nvm 安装的 claude 路径列表
   */
  private getNvmClaudePaths(): string[] {
    const paths: string[] = [];
    const nvmDir = process.env.NVM_DIR || join(homedir(), '.nvm');

    try {
      // 检查 nvm 的 versions/node 目录
      const versionsDir = join(nvmDir, 'versions', 'node');
      if (existsSync(versionsDir)) {
        const nodeVersions = readdirSync(versionsDir);
        for (const version of nodeVersions) {
          const claudePath = join(versionsDir, version, 'lib', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
          if (existsSync(claudePath)) {
            paths.push(claudePath);
          }
        }
      }
    } catch {
      // 忽略错误
    }

    return paths;
  }

  async start(): Promise<void> {
    if (this.state !== SdkSessionState.STARTING) {
      throw new Error('会话已在运行中');
    }

    console.log(`[SDK:${this.config.sessionId}] 启动 SDK 会话`);
    console.log(`[SDK:${this.config.sessionId}] 工程路径: ${this.config.projectPath}`);

    // === 开发态调试日志 ===
    console.log(`[SDK:${this.config.sessionId}] 环境变量检查:`);
    console.log(`  - ANTHROPIC_API_KEY (原始): ${process.env.ANTHROPIC_API_KEY ? `${process.env.ANTHROPIC_API_KEY.slice(0, 10)}...` : '未设置'}`);
    console.log(`  - ANTHROPIC_AUTH_TOKEN: ${process.env.ANTHROPIC_AUTH_TOKEN ? `${process.env.ANTHROPIC_AUTH_TOKEN.slice(0, 10)}...` : '未设置'}`);
    console.log(`  - 最终 API_KEY: ${ (process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY) ? '已设置' : '❌ 未设置'}`);
    console.log(`  - ANTHROPIC_BASE_URL: ${process.env.ANTHROPIC_BASE_URL || '未设置'}`);
    console.log(`  - PATH: ${process.env.PATH?.split(':').slice(0, 3).join(':')}...`);

    const options: Options = {
      cwd: this.config.projectPath,
      abortController: this.abortController,
      includePartialMessages: true,
      allowedTools: [
        'Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep',
        'WebSearch', 'WebFetch', 'TodoRead', 'TodoWrite',
        'Skill', // 允许使用 Skill 工具，以便调用 skills
      ],
      permissionMode: 'default',
      canUseTool: (toolName, input, opts) => this.handlePermissionRequest(toolName, input, opts),
      // 显式配置环境变量，避免 SDK 的 elicitation 机制
      // 注意：必须展开 process.env 以保留 PATH 等关键环境变量，否则 node 命令无法找到
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY,
        ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
      },
      // 显式配置 Claude Code 可执行文件路径
      // 动态检测 claude 命令路径，兼容 macOS/Linux
      pathToClaudeCodeExecutable: this.getClaudeExecutablePath(),
      // 始终启用会话持久化，确保对话被写入 JSONL 文件
      // 无论是新会话还是恢复历史会话，都需要持久化
      persistSession: true,
      // 禁用 MCP elicitation 钩子
      onElicitation: undefined,
      // 启用文件系统设置加载，以便加载 skills 和 commands
      // - 'user': 从 ~/.claude/ 加载用户级设置和 skills
      // - 'project': 从 .claude/ 加载项目级设置
      // - 'local': 从 .claude/settings.local.json 加载本地设置
      // 不设置此项时，SDK 处于隔离模式，不加载任何文件系统设置
      settingSources: ['user', 'project', 'local'],
    };

    if (this.config.options?.model) {
      options.model = this.config.options.model;
    }

    if (this.config.resumeSdkSessionId) {
      options.resume = this.config.resumeSdkSessionId;
      console.log(`[SDK:${this.config.sessionId}] 恢复会话: ${this.config.resumeSdkSessionId}`);
    }

    const hasInitialPrompt = !!this.config.initialPrompt;

    if (hasInitialPrompt) {
      this.messageQueue.push({
        type: 'user',
        message: { role: 'user', content: this.config.initialPrompt! },
        parent_tool_use_id: null,
        session_id: '',
      } as SDKUserMessage);
    }

    // === 开发态调试日志：输出完整 options ===
    const finalApiKey = (options.env as Record<string, string>)?.ANTHROPIC_API_KEY;
    console.log(`[SDK:${this.config.sessionId}] Options 配置:`);
    console.log(`  - cwd: ${options.cwd}`);
    console.log(`  - pathToClaudeCodeExecutable: ${options.pathToClaudeCodeExecutable}`);
    console.log(`  - persistSession: ${options.persistSession}`);
    console.log(`  - permissionMode: ${options.permissionMode}`);
    console.log(`  - model: ${options.model || '(默认)'}`);
    console.log(`  - resume: ${options.resume || '(无)'}`);
    console.log(`  - env.ANTHROPIC_API_KEY: ${finalApiKey ? `${finalApiKey.slice(0, 15)}... (长度: ${finalApiKey.length})` : '❌ 未设置'}`);
    console.log(`  - env.ANTHROPIC_BASE_URL: ${(options.env as Record<string, string>)?.ANTHROPIC_BASE_URL || '(默认)'}`);
    console.log(`  - env.PATH 前缀: ${(options.env as Record<string, string>)?.PATH?.split(':').slice(0, 2).join(':')}...`);

    this.queryInstance = query({
      prompt: this.messageQueue as unknown as AsyncIterable<SDKUserMessage>,
      options,
    });

    this.state = SdkSessionState.RUNNING;
    this.emit('started');

    this.processMessages().catch((err) => {
      console.error(`[SDK:${this.config.sessionId}] 消息处理异常:`, err);
      this.emitChatEvent('error', { content: String(err) });
      this.state = SdkSessionState.ENDED;
      this.emit('end', {
        session_id: this.config.sessionId,
        exit_code: 1,
        ended_at: new Date(),
        reason: String(err),
      });
    });
  }

  /**
   * 遍历 SDK 消息流，分类 emit 事件
   */
  private async processMessages(): Promise<void> {
    if (!this.queryInstance) return;

    let currentToolName: string | null = null;
    let currentToolId: string | null = null;
    let toolInputAccumulator = '';

    try {
      for await (const message of this.queryInstance) {
        if (this.state === SdkSessionState.ENDED) break;
        this.routeMessage(
          message,
          { currentToolName, currentToolId, toolInputAccumulator },
          (updates) => {
            if (updates.currentToolName !== undefined) currentToolName = updates.currentToolName;
            if (updates.currentToolId !== undefined) currentToolId = updates.currentToolId;
            if (updates.toolInputAccumulator !== undefined) toolInputAccumulator = updates.toolInputAccumulator;
          },
        );
      }
    } finally {
      if (this.state !== SdkSessionState.ENDED) {
        this.state = SdkSessionState.ENDED;
        this.emit('end', {
          session_id: this.config.sessionId,
          exit_code: 0,
          ended_at: new Date(),
        });
      }
    }
  }

  private routeMessage(
    message: SDKMessage,
    ctx: { currentToolName: string | null; currentToolId: string | null; toolInputAccumulator: string },
    update: (u: Partial<typeof ctx>) => void,
  ): void {
    switch (message.type) {
      case 'system':
        if ('subtype' in message && message.subtype === 'init') {
          this.sdkSessionId = message.session_id;
          console.log(`[SDK:${this.config.sessionId}] SDK session_id: ${this.sdkSessionId}`);
        }
        break;

      case 'stream_event':
        this.handleStreamEvent(message.event, ctx, update);
        break;

      case 'assistant': {
        const assistantMsg = message;
        if (assistantMsg.message?.content) {
          for (const block of assistantMsg.message.content) {
            if (typeof block === 'object' && 'type' in block) {
              if (block.type === 'tool_result') {
                const resultBlock = block as { type: 'tool_result'; tool_use_id: string; content?: unknown; is_error?: boolean };
                this.emitChatEvent('tool_result', {
                  toolId: resultBlock.tool_use_id,
                  toolResult: typeof resultBlock.content === 'string'
                    ? resultBlock.content
                    : JSON.stringify(resultBlock.content),
                  isError: resultBlock.is_error ?? false,
                });
              }
            }
          }
        }
        break;
      }

      case 'user': {
        // SDK 在工具执行完成后会发送 user 消息，其中包含 tool_result
        const userMsg = message as { message?: { content?: unknown[] } };
        if (userMsg.message?.content) {
          for (const block of userMsg.message.content) {
            if (typeof block === 'object' && block !== null && 'type' in block) {
              if (block.type === 'tool_result') {
                const resultBlock = block as { type: 'tool_result'; tool_use_id: string; content?: unknown; is_error?: boolean };
                console.log(`[SDK:${this.config.sessionId}] Received tool_result from user message:`, resultBlock.tool_use_id);
                this.emitChatEvent('tool_result', {
                  toolId: resultBlock.tool_use_id,
                  toolResult: typeof resultBlock.content === 'string'
                    ? resultBlock.content
                    : JSON.stringify(resultBlock.content),
                  isError: resultBlock.is_error ?? false,
                });
              }
            }
          }
        }
        break;
      }

      case 'result':
        this.emitChatEvent('complete', {
          content: 'result' in message ? (message as { result?: string }).result : undefined,
          modelUsage: message.usage
            ? { input: message.usage.input_tokens, output: message.usage.output_tokens }
            : undefined,
        });
        break;

      default:
        break;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleStreamEvent(
    event: any,
    ctx: { currentToolName: string | null; currentToolId: string | null; toolInputAccumulator: string },
    update: (u: { currentToolName?: string | null; currentToolId?: string | null; toolInputAccumulator?: string }) => void,
  ): void {
    if (!event || typeof event !== 'object') return;

    switch (event.type) {
      case 'content_block_start': {
        const block = event.content_block;
        if (block?.type === 'tool_use') {
          update({
            currentToolName: block.name,
            currentToolId: block.id,
            toolInputAccumulator: '',
          });
        }
        break;
      }

      case 'content_block_delta': {
        const delta = event.delta;
        if (delta?.type === 'text_delta') {
          this.emitChatEvent('text_delta', { content: delta.text });
        } else if (delta?.type === 'input_json_delta') {
          update({ toolInputAccumulator: ctx.toolInputAccumulator + (delta.partial_json ?? '') });
        }
        break;
      }

      case 'content_block_stop': {
        if (ctx.currentToolName && ctx.currentToolId) {
          this.emitChatEvent('tool_use', {
            toolName: ctx.currentToolName,
            toolId: ctx.currentToolId,
            toolInput: ctx.toolInputAccumulator,
          });
          update({ currentToolName: null, currentToolId: null, toolInputAccumulator: '' });
        }
        break;
      }

      case 'message_start':
        this.emitChatEvent('text', { content: '' });
        break;

      default:
        break;
    }
  }

  /**
   * 处理 SDK 权限请求 -- 挂起 Promise 等待前端回复
   */
  private handlePermissionRequest(
    toolName: string,
    input: Record<string, unknown>,
    opts: { toolUseID: string },
  ): Promise<PermissionResult> {
    const requestId = opts.toolUseID || `perm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    this.emit('chat-permission-request', {
      session_id: this.config.sessionId,
      toolName,
      toolInput: input,
      requestId,
    });

    return new Promise<PermissionResult>((resolve) => {
      this.pendingPermissions.set(requestId, resolve);
    });
  }

  /**
   * 外部调用：用户发送消息
   */
  sendMessage(content: string): void {
    if (this.state !== SdkSessionState.RUNNING) {
      console.warn(`[SDK:${this.config.sessionId}] 会话未运行，忽略消息`);
      return;
    }

    this.messageQueue.push({
      type: 'user',
      message: { role: 'user', content },
      parent_tool_use_id: null,
      session_id: this.sdkSessionId ?? '',
    } as SDKUserMessage);
  }

  /**
   * 外部调用：回答权限请求
   */
  answerPermission(requestId: string, approved: boolean, message?: string, updatedInput?: Record<string, unknown>): void {
    const resolver = this.pendingPermissions.get(requestId);
    if (!resolver) {
      console.warn(`[SDK:${this.config.sessionId}] 未找到权限请求: ${requestId}`);
      return;
    }

    this.pendingPermissions.delete(requestId);

    if (approved) {
      // 如果有 updatedInput (例如 AskUserQuestion 的答案)，则将其传递回 SDK
      // SDK 的 PermissionResult Zod schema 要求 allow 分支必须包含 updatedInput
      resolver({ behavior: 'allow', updatedInput: updatedInput ?? {} });
    } else {
      resolver({ behavior: 'deny', message: message ?? 'User denied this action' });
    }
  }

  async end(reason?: string): Promise<void> {
    if (this.state === SdkSessionState.ENDED) return;

    console.log(`[SDK:${this.config.sessionId}] 结束会话: ${reason ?? '用户请求'}`);
    this.state = SdkSessionState.ENDED;

    for (const [, resolver] of this.pendingPermissions) {
      resolver({ behavior: 'deny', message: 'Session ended' });
    }
    this.pendingPermissions.clear();

    this.messageQueue.close();
    this.abortController.abort();

    if (this.queryInstance) {
      try {
        this.queryInstance.close();
      } catch {
        // ignore
      }
      this.queryInstance = null;
    }
  }

  private emitChatEvent(
    type: ChatMessageEvent['type'],
    data: Partial<Omit<ChatMessageEvent, 'session_id' | 'type' | 'timestamp'>>,
  ): void {
    const event: ChatMessageEvent = {
      session_id: this.config.sessionId,
      type,
      timestamp: new Date(),
      ...data,
    };

    this.emit('chat-message', event);
  }

  getState(): SdkSessionState {
    return this.state;
  }

  getSdkSessionId(): string | null {
    return this.sdkSessionId;
  }

  isRunning(): boolean {
    return this.state === SdkSessionState.RUNNING;
  }

  getInfo() {
    return {
      sessionId: this.config.sessionId,
      projectPath: this.config.projectPath,
      state: this.state,
      startTime: this.startTime,
      sdkSessionId: this.sdkSessionId,
    };
  }
}

/**
 * SDK 会话管理器
 */
export class SdkSessionManager extends EventEmitter {
  private sessions = new Map<string, SdkSession>();

  async createSession(config: SdkSessionConfig): Promise<SdkSession> {
    const session = new SdkSession(config);
    console.log('[SdkSessionManager][Diag] createSession', {
      sessionId: config.sessionId,
      beforeCount: this.sessions.size,
      resumeSdkSessionId: config.resumeSdkSessionId ?? null,
    });

    session.on('chat-message', (event: ChatMessageEvent) => this.emit('chat-message', event));
    session.on('chat-permission-request', (event) => this.emit('chat-permission-request', event));
    session.on('end', (event) => {
      this.sessions.delete(config.sessionId);
      console.log('[SdkSessionManager][Diag] session ended', {
        sessionId: config.sessionId,
        afterCount: this.sessions.size,
      });
      this.emit('end', event);
    });

    await session.start();
    this.sessions.set(config.sessionId, session);
    console.log('[SdkSessionManager][Diag] createSession done', {
      sessionId: config.sessionId,
      afterCount: this.sessions.size,
    });
    return session;
  }

  getSession(sessionId: string): SdkSession | undefined {
    return this.sessions.get(sessionId);
  }

  async endSession(sessionId: string, reason?: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      console.log('[SdkSessionManager][Diag] endSession begin', {
        sessionId,
        reason: reason ?? null,
        beforeCount: this.sessions.size,
      });
      await session.end(reason);
      this.sessions.delete(sessionId);
      console.log('[SdkSessionManager][Diag] endSession done', {
        sessionId,
        afterCount: this.sessions.size,
      });
    }
  }

  async endAllSessions(): Promise<void> {
    const promises = Array.from(this.sessions.values()).map((s) => s.end('服务关闭'));
    await Promise.all(promises);
    this.sessions.clear();
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * 获取会话消息（支持分页）
   *
   * @param sdkSessionId - SDK 会话 ID
   * @param projectPath - 项目路径
   * @param options - 分页选项
   *   - limit: 每页消息数（默认50）
   *   - offset: 从开头跳过的消息数（用于加载更早的消息）
   *   - fromEnd: 是否从末尾开始加载（默认true，加载最新消息）
   * @returns 分页响应，包含消息和分页元数据
   */
  async getSessionMessages(
    sdkSessionId: string,
    projectPath: string,
    options: { limit?: number; offset?: number; fromEnd?: boolean } = {}
  ): Promise<{
    messages: HistoryMessage[];
    total: number;
    hasMore: boolean;
    offset: number;
    limit: number;
  }> {
    const { limit = 50, offset: requestedOffset, fromEnd = true } = options;

    try {
      // 使用直接读取JSONL的方式绕过SDK的bug
      // SDK的getSessionMessages在合并同一message.id的记录时会丢失部分content
      const allSdkMessages = this.readSessionJsonlDirectly(sdkSessionId, projectPath);

      if (allSdkMessages.length === 0) {
        // 如果直接读取失败，回退到SDK
        console.log(`[SdkSessionManager] Direct JSONL read returned 0, falling back to SDK`);
        const allMessages = await getSessionMessages(sdkSessionId, { dir: projectPath });
        return this.processMessages(allMessages as unknown as SDKMessage[], limit, requestedOffset, fromEnd);
      }

      console.log(`[SdkSessionManager] Direct JSONL read returned ${allSdkMessages.length} messages`);
      return this.processMessages(allSdkMessages, limit, requestedOffset, fromEnd);
    } catch (error) {
      console.error(`[SdkSessionManager] getSessionMessages 失败:`, error);
      return {
        messages: [],
        total: 0,
        hasMore: false,
        offset: 0,
        limit,
      };
    }
  }

  /**
   * 处理消息列表，提取HistoryMessage并支持分页
   */
  private processMessages(
    allMessages: SDKMessage[],
    limit: number,
    requestedOffset: number | undefined,
    fromEnd: boolean
  ): { messages: HistoryMessage[]; total: number; hasMore: boolean; offset: number; limit: number } {
    const total = allMessages.length;

    // 计算实际的 offset
    let actualOffset: number;
    if (requestedOffset !== undefined) {
      actualOffset = Math.max(0, Math.min(requestedOffset, total));
    } else if (fromEnd) {
      actualOffset = Math.max(0, total - limit);
    } else {
      actualOffset = 0;
    }

    // 获取分页数据
    const messages = allMessages.slice(actualOffset, actualOffset + limit);

    // 先从所有消息中提取 tool_use 建立索引，并预匹配 tool_result
    const allToolUses = new Map<string, HistoryMessage>();
    // 先收集所有的 tool_result，用于后续匹配
    const toolResults = new Map<string, { content: string; isError: boolean }>();

    // 修复: 在第一轮遍历时提取原始时间戳
    for (const msg of allMessages) {
      if (msg.type === 'assistant') {
        const timestamp = this.extractMessageTimestamp(msg);
        this.extractAssistantBlocksToMap(msg.message, allToolUses, timestamp);
      } else if (msg.type === 'user') {
        this.extractToolResultsToMap(msg.message, toolResults);
      }
    }

    // 将 tool_result 匹配到对应的 tool_use
    for (const [toolId, toolResult] of toolResults) {
      const toolUse = allToolUses.get(toolId);
      if (toolUse) {
        toolUse.toolResult = toolResult.content;
        toolUse.isError = toolResult.isError;
      }
    }

    console.log(`[SdkSessionManager] Pre-matched ${toolResults.size} tool_results to tool uses`);

    const result: HistoryMessage[] = [];
    for (const msg of messages) {
      if (msg.type === 'user') {
        const timestamp = this.extractMessageTimestamp(msg);
        const content = this.extractMessageContent(msg.message);
        if (content) {
          result.push({ role: 'user', content, timestamp });
        }
        // 从 user 消息中提取 tool_result 并匹配到对应的 tool_use（使用全局索引）
        // 修复: 不再向 result 中插入 tool_use
        this.extractToolResultsFromUserWithMap(msg.message, result, allToolUses);
      } else if (msg.type === 'assistant') {
        const timestamp = this.extractMessageTimestamp(msg);
        this.extractAssistantBlocks(msg.message, result, allToolUses, timestamp);
      }
    }

    return {
      messages: result,
      total,
      hasMore: actualOffset > 0,
      offset: actualOffset,
      limit,
    };
  }

  /**
   * 从 SDK 消息中提取时间戳
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractMessageTimestamp(msg: any): number {
    // 尝试从不同位置获取时间戳
    if (msg.timestamp) {
      return typeof msg.timestamp === 'string' ? new Date(msg.timestamp).getTime() : msg.timestamp;
    }
    if (msg.message?.timestamp) {
      return typeof msg.message.timestamp === 'string' ? new Date(msg.message.timestamp).getTime() : msg.message.timestamp;
    }
    // 默认使用当前时间
    return Date.now();
  }

  /**
   * 直接从JSONL文件读取会话消息，绕过SDK的bug
   * SDK的getSessionMessages在合并同一message.id的记录时会丢失部分content
   */
  private readSessionJsonlDirectly(sdkSessionId: string, projectPath: string): SDKMessage[] {
    try {
      const projectsDir = join(homedir(), '.claude', 'projects');
      const safeProjectPath = projectPath.replace(/[\/_]/g, "-");
      const jsonlPath = join(projectsDir, safeProjectPath, `${sdkSessionId}.jsonl`);

      console.log(`[SdkSessionManager] Reading JSONL directly: ${jsonlPath}`);

      if (!existsSync(jsonlPath)) {
        console.log(`[SdkSessionManager] JSONL file not found`);
        return [];
      }

      const content = readFileSync(jsonlPath, 'utf-8');
      const lines = content.trim().split('\n');
      console.log(`[SdkSessionManager] JSONL has ${lines.length} lines`);

      // 解析所有记录
      interface JsonlRecord {
        type: string;
        message?: {
          id?: string;
          role?: string;
          content?: unknown;
        };
        timestamp?: string;
      }

      const records: JsonlRecord[] = [];
      for (const line of lines) {
        try {
          records.push(JSON.parse(line));
        } catch {
          // 忽略解析错误
        }
      }

      // 按 message.id 分组合并 assistant 消息
      const assistantMessages = new Map<string, { id: string; content: unknown[]; timestamp: string }>();
      const userMessages: { message: { role: string; content: unknown }; timestamp: string }[] = [];

      for (const record of records) {
        if (record.type === 'assistant' && record.message?.id) {
          const msgId = record.message.id;
          if (!assistantMessages.has(msgId)) {
            assistantMessages.set(msgId, {
              id: msgId,
              content: [],
              timestamp: record.timestamp || new Date().toISOString(),
            });
          }
          const merged = assistantMessages.get(msgId)!;
          // 合并 content blocks - 这是修复SDK bug的关键
          if (record.message?.content) {
            const blocks = Array.isArray(record.message.content)
              ? record.message.content
              : [record.message.content];
            merged.content.push(...blocks);
          }
        } else if (record.type === 'user' && record.message) {
          userMessages.push({
            message: {
              role: record.message.role || 'user',
              content: record.message.content,
            },
            timestamp: record.timestamp || new Date().toISOString(),
          });
        }
      }

      console.log(`[SdkSessionManager] Merged: ${assistantMessages.size} assistant, ${userMessages.length} user messages`);

      // 统计 tool_use 和 tool_result
      let toolUseCount = 0;
      let toolResultCount = 0;
      for (const [, msg] of assistantMessages) {
        for (const block of msg.content as unknown[]) {
          if (typeof block === 'object' && block !== null && (block as { type?: string }).type === 'tool_use') {
            toolUseCount++;
          }
        }
      }
      for (const userMsg of userMessages) {
        const content = userMsg.message.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (typeof block === 'object' && block !== null && (block as { type?: string }).type === 'tool_result') {
              toolResultCount++;
            }
          }
        }
      }
      console.log(`[SdkSessionManager] Stats: tool_use=${toolUseCount}, tool_result=${toolResultCount}`);

      // 创建带时间戳的消息对象并排序
      const timestampedMessages: { timestamp: string; msg: SDKMessage }[] = [];

      for (const [id, msg] of assistantMessages) {
        timestampedMessages.push({
          timestamp: msg.timestamp,
          msg: {
            type: 'assistant',
            message: {
              id: msg.id,
              role: 'assistant',
              content: msg.content,
            },
          } as SDKMessage,
        });
      }

      for (const userMsg of userMessages) {
        timestampedMessages.push({
          timestamp: userMsg.timestamp,
          msg: {
            type: 'user',
            message: userMsg.message,
          } as SDKMessage,
        });
      }

      // 按时间戳排序
      timestampedMessages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      console.log(`[SdkSessionManager] Direct read returning ${timestampedMessages.length} messages`);
      // 将 JSONL 行级时间戳挂到 SDKMessage 上，供 extractMessageTimestamp 使用，避免两轮 processMessages 各调 Date.now() 导致偏置
      return timestampedMessages.map(
        (t) => ({ ...t.msg, timestamp: t.timestamp }) as unknown as SDKMessage,
      );
    } catch (error) {
      console.error(`[SdkSessionManager] Direct JSONL read failed:`, error);
      return [];
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractMessageContent(message: any): string {
    if (!message?.content) return '';
    if (typeof message.content === 'string') return message.content;
    if (Array.isArray(message.content)) {
      return message.content
        .filter((b: { type: string; text?: string }) => b.type === 'text' && b.text)
        .map((b: { text: string }) => b.text)
        .join('\n');
    }
    return '';
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractToolResultsFromUser(message: any, result: HistoryMessage[]): void {
    if (!message?.content) return;
    const blocks = Array.isArray(message.content) ? message.content : [message.content];

    for (const block of blocks) {
      if (typeof block === 'object' && block !== null && block.type === 'tool_result') {
        const existing = result.find((m) => m.toolId === block.tool_use_id);
        if (existing) {
          existing.toolResult = typeof block.content === 'string' ? block.content : JSON.stringify(block.content ?? '');
          existing.isError = block.is_error ?? false;
          console.log(`[SdkSessionManager] Matched tool_result to tool_use: ${block.tool_use_id}`);
        } else {
          console.log(`[SdkSessionManager] tool_result without matching tool_use: ${block.tool_use_id}`);
        }
      }
    }
  }

  /**
   * 从 assistant 消息中提取 tool_use 并存入全局 Map（用于跨分页匹配）
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractAssistantBlocksToMap(message: any, toolUseMap: Map<string, HistoryMessage>, timestamp: number): void {
    if (!message?.content) return;
    const blocks = Array.isArray(message.content) ? message.content : [message.content];
    let blockOrder = 0;

    for (const block of blocks) {
      if (typeof block !== 'string' && block.type === 'tool_use') {
        const toolUse: HistoryMessage = {
          role: 'assistant',
          content: '',
          isToolUse: true,
          toolName: block.name,
          toolId: block.id,
          toolInput: typeof block.input === 'string' ? block.input : JSON.stringify(block.input ?? {}),
          timestamp,
          order: blockOrder,
        };
        toolUseMap.set(block.id, toolUse);
      }
      blockOrder++;
    }
  }

  /**
   * 从 user 消息中提取 tool_result 并存入 Map
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractToolResultsToMap(message: any, toolResultMap: Map<string, { content: string; isError: boolean }>): void {
    if (!message?.content) return;
    const blocks = Array.isArray(message.content) ? message.content : [message.content];

    for (const block of blocks) {
      if (typeof block === 'object' && block !== null && block.type === 'tool_result') {
        toolResultMap.set(block.tool_use_id, {
          content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content ?? ''),
          isError: block.is_error ?? false,
        });
      }
    }
  }

  /**
   * 从 user 消息中提取 tool_result 并使用全局 Map 匹配
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractToolResultsFromUserWithMap(message: any, result: HistoryMessage[], toolUseMap: Map<string, HistoryMessage>): void {
    if (!message?.content) return;
    const blocks = Array.isArray(message.content) ? message.content : [message.content];

    for (const block of blocks) {
      if (typeof block === 'object' && block !== null && block.type === 'tool_result') {
        const toolUseId = block.tool_use_id;
        // 先在当前 result 中查找
        let existing = result.find((m) => m.toolId === toolUseId);
        if (existing) {
          existing.toolResult = typeof block.content === 'string' ? block.content : JSON.stringify(block.content ?? '');
          existing.isError = block.is_error ?? false;
          console.log(`[SdkSessionManager] Matched tool_result to tool_use in result: ${toolUseId}`);
          // 同时更新全局 Map 中的对象（如果存在），确保引用一致性
          const globalToolUse = toolUseMap.get(toolUseId);
          if (globalToolUse && globalToolUse !== existing) {
            globalToolUse.toolResult = existing.toolResult;
            globalToolUse.isError = existing.isError;
            console.log(`[SdkSessionManager] Updated global map tool_use ${toolUseId}: has toolResult=${!!globalToolUse.toolResult}`);
          }
        } else {
          // 修复: 不再向 result 中插入 tool_use，避免顺序错乱
          // 只更新全局 Map 中的 tool_use（用于跨分页匹配时，tool_use 在其他分页中）
          const globalToolUse = toolUseMap.get(toolUseId);
          if (globalToolUse) {
            globalToolUse.toolResult = typeof block.content === 'string' ? block.content : JSON.stringify(block.content ?? '');
            globalToolUse.isError = block.is_error ?? false;
            console.log(`[SdkSessionManager] Updated global map tool_use ${toolUseId} with toolResult`);
          } else {
            console.log(`[SdkSessionManager] tool_result without matching tool_use: ${toolUseId}`);
          }
        }
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractAssistantBlocks(message: any, result: HistoryMessage[], allToolUses?: Map<string, HistoryMessage>, timestamp?: number): void {
    if (!message?.content) return;
    const blocks = Array.isArray(message.content) ? message.content : [message.content];
    const msgTimestamp = timestamp ?? Date.now();
    let blockOrder = 0;

    for (const block of blocks) {
      if (typeof block === 'string') {
        if (block.trim()) result.push({ role: 'assistant', content: block, timestamp: msgTimestamp, order: blockOrder });
        blockOrder++;
        continue;
      }
      if (block.type === 'text' && block.text) {
        result.push({ role: 'assistant', content: block.text, timestamp: msgTimestamp, order: blockOrder });
        blockOrder++;
      } else if (block.type === 'tool_use') {
        // 优先使用全局 Map 中已有的 tool_use（可能包含 toolResult）
        const existingToolUse = allToolUses?.get(block.id);
        if (existingToolUse) {
          // 与 text 块共用本条 assistant 消息的时间戳（无原始时间时两轮 Date.now() 可能不一致）
          existingToolUse.timestamp = msgTimestamp;
          existingToolUse.order = blockOrder;
          console.log(`[SdkSessionManager] Using tool_use from global map: ${block.id}, has toolResult: ${!!existingToolUse.toolResult}, order: ${blockOrder}`);
          result.push(existingToolUse);
        } else {
          console.log(`[SdkSessionManager] Creating new tool_use: ${block.id}, toolName: ${block.name}`);
          result.push({
            role: 'assistant',
            content: '',
            isToolUse: true,
            toolName: block.name,
            toolId: block.id,
            toolInput: typeof block.input === 'string' ? block.input : JSON.stringify(block.input ?? {}),
            timestamp: msgTimestamp,
            order: blockOrder,
          });
        }
        blockOrder++;
      } else if (block.type === 'tool_result') {
        const existing = result.find((m) => m.toolId === block.tool_use_id);
        if (existing) {
          existing.toolResult = typeof block.content === 'string' ? block.content : JSON.stringify(block.content ?? '');
          existing.isError = block.is_error ?? false;
        }
        // tool_result 不增加 blockOrder，因为它不是 assistant 消息中的块
      }
    }
  }

  async listProjectSessions(projectPath: string): Promise<SessionHistoryItem[]> {
    try {
      console.log(`[SdkSessionManager] listSessions 调用, projectPath: ${projectPath}`);
      const sessions = await listSessions({ dir: projectPath });
      console.log(`[SdkSessionManager] listSessions 返回: ${sessions.length} sessions`);
      if (sessions.length > 0) {
        console.log(`[SdkSessionManager] 第一个 session:`, JSON.stringify(sessions[0], null, 2));
      }
      return sessions.map((s) => ({
        sdkSessionId: s.sessionId,
        summary: s.summary || s.firstPrompt || 'New Session',
        lastModified: s.lastModified,
        firstPrompt: s.firstPrompt,
      }));
    } catch (error) {
      console.error(`[SdkSessionManager] listSessions 失败 (${projectPath}):`, error);
      return [];
    }
  }

  /**
   * 获取历史会话信息（用于恢复历史会话查看）
   * 遍历所有已知项目目录查找指定的会话
   */
  async getHistorySession(sessionId: string): Promise<{ sessionId: string; cwd: string } | null> {
    try {
      // 获取 Claude 项目目录下的所有项目
      const projectsDir = join(homedir(), '.claude', 'projects');

      if (!existsSync(projectsDir)) {
        console.log(`[SdkSessionManager] Projects directory not found: ${projectsDir}`);
        return null;
      }

      // 读取所有项目目录
      const projectDirs = require('fs').readdirSync(projectsDir, { withFileTypes: true })
        .filter((dirent: { isDirectory: () => boolean }) => dirent.isDirectory())
        .map((dirent: { name: string }) => dirent.name);

      console.log(`[SdkSessionManager] Found ${projectDirs.length} project directories`);

      // 遍历每个项目目录查找会话
      for (const projectDir of projectDirs) {
        // 将目录名转换回路径
        const projectPath = projectDir.replace(/-/g, '/').replace(/^\//, '');

        try {
          const sessions = await listSessions({ dir: projectPath });
          const session = sessions.find((s) => s.sessionId === sessionId);
          if (session) {
            console.log(`[SdkSessionManager] Found session ${sessionId} in project ${projectPath}`);
            return {
              sessionId: session.sessionId,
              cwd: session.cwd || projectPath,
            };
          }
        } catch {
          // 忽略单个项目目录的错误
        }
      }

      console.log(`[SdkSessionManager] Session ${sessionId} not found in any project`);
      return null;
    } catch (error) {
      console.error(`[SdkSessionManager] getHistorySession 失败:`, error);
      return null;
    }
  }
}

export const sdkSessionManager = new SdkSessionManager();
