/**
 * Claude Code Remote - 共享常量定义
 */

// Socket事件名称
export const SocketEvents = {
  // Agent事件
  AGENT_PING: 'agent:ping',
  AGENT_PONG: 'agent:pong',
  SCAN_PROJECTS: 'scan-projects',
  PROJECTS_LIST: 'projects:list',
  START_SESSION: 'start-session',
  SESSION_STARTED: 'session-started',
  SESSION_OUTPUT: 'session-output',
  SESSION_INPUT: 'session-input',
  SESSION_PERMISSION_ANSWER: 'session-permission-answer',
  SESSION_END: 'session-end',
  JOIN_SESSION: 'join-session',
  SESSION_BUFFER: 'session-buffer',
  SEND_BUFFER: 'send-buffer',
  SESSION_RESIZE: 'session-resize',

  // Chat 模式事件（SDK）
  CHAT_MESSAGE: 'chat:message',
  CHAT_TOOL_USE: 'chat:tool-use',
  CHAT_TOOL_RESULT: 'chat:tool-result',
  CHAT_COMPLETE: 'chat:complete',
  CHAT_ERROR: 'chat:error',
  CHAT_SEND: 'chat:send',
  CHAT_PERMISSION_REQUEST: 'chat:permission-request',
  CHAT_PERMISSION_ANSWER: 'chat:permission-answer',
  CHAT_ABORT: 'chat:abort',

  // 会话历史
  LIST_SESSIONS: 'list-sessions',
  SESSIONS_LIST: 'sessions:list',
  GET_SESSION_MESSAGES: 'get-session-messages',
  SESSION_MESSAGES: 'session:messages',

  // 文件列表
  LIST_FILES: 'list-files',
  FILES_LIST: 'files:list',

  // 文件操作
  READ_FILE: 'read-file',
  FILE_CONTENT: 'file:content',
  WRITE_FILE: 'write-file',
  FILE_SAVED: 'file:saved',
  CREATE_FILE: 'create-file',
  DELETE_FILE: 'delete-file',
  RENAME_FILE: 'rename-file',
  FILE_OPERATION_RESULT: 'file:operation-result',

  // 斜杠命令
  LIST_COMMANDS: 'list-commands',
  COMMANDS_LIST: 'commands:list',

  // Client事件
  CLIENT_CONNECTED: 'client:connected',
  MACHINES_LIST: 'machines:list',
  ERROR: 'error',

  // 会话分享事件
  SHARE_SESSION: 'share-session',
  STOP_SHARE: 'stop-share',
  JOIN_SHARED_SESSION: 'join-shared-session',
  SHARED_SESSION_VIEWERS: 'shared:viewers',

  // Agent 状态事件
  AGENT_STATUS_CHANGED: 'agent:status_changed',

  // Git 操作事件
  GIT_STATUS: 'git:status',
  GIT_STATUS_RESPONSE: 'git:status-response',
  GIT_LOG: 'git:log',
  GIT_LOG_RESPONSE: 'git:log-response',
  GIT_STAGE: 'git:stage',
  GIT_STAGE_RESPONSE: 'git:stage-response',
  GIT_UNSTAGE: 'git:unstage',
  GIT_UNSTAGE_RESPONSE: 'git:unstage-response',
  GIT_COMMIT: 'git:commit',
  GIT_COMMIT_RESPONSE: 'git:commit-response',

  // 路径验证事件
  VALIDATE_PATH: 'validate-path',
  PATH_VALIDATED: 'path:validated',
} as const;

// 心跳配置
export const HEARTBEAT_INTERVAL = 25000; // 25秒
export const HEARTBEAT_TIMEOUT = 60000; // 60秒超时
export const ONLINE_THRESHOLD = 60000; // 60秒内认为在线

// 会话配置
export const SESSION_BUFFER_SIZE = 200; // 保留最近200行输出
export const SESSION_AUTO_END_DELAY = 600000; // 所有客户端断开10分钟后自动结束

// 服务器配置
export const DEFAULT_SERVER_PORT = 3000;
export const DEFAULT_WEB_PORT = 5173;

// Claude CLI配置（遥测通过环境变量 CLAUDE_DISABLE_TELEMETRY=1 关闭，新版 CLI 已移除 --no-telemetry）
export const CLAUDE_CLI_COMMAND = 'claude';
export const CLAUDE_CLI_ARGS: string[] = [];

// 环境变量名
export const ENV_VARS = {
  DATABASE_URL: 'DATABASE_URL',
  PORT: 'PORT',
  NODE_ENV: 'NODE_ENV',
  JWT_SECRET: 'JWT_SECRET',
  JWT_EXPIRES_IN: 'JWT_EXPIRES_IN',
  CORS_ORIGIN: 'CORS_ORIGIN',
} as const;

// Socket.io命名空间
export const SocketNamespaces = {
  AGENT: '/agent',
  CLIENT: '/client',
} as const;

// HTTP状态码
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
} as const;

// 错误消息
export const ERROR_MESSAGES = {
  UNAUTHORIZED: '未授权访问',
  INVALID_TOKEN: '无效的令牌',
  MACHINE_NOT_FOUND: '机器不存在',
  MACHINE_OFFLINE: '机器离线',
  SESSION_NOT_FOUND: '会话不存在',
  NO_PERMISSION: '无权限访问',
  INVALID_INPUT: '无效的输入',
  PATH_NOT_FOUND: '路径不存在',
  PATH_NOT_DIRECTORY: '路径不是目录',
} as const;
