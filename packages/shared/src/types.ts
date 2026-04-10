/**
 * Claude Code Remote - 共享类型定义
 */

// ==================== 数据库实体类型 ====================

export interface User {
  id: string;
  email: string;
  username?: string | null;
  created_at: Date;
}

export interface Machine {
  id: string;
  user_id: string;
  name: string;
  hostname: string;
  last_seen?: Date | null;
  created_at: Date;
}

export interface Project {
  id: string;
  machine_id: string;
  path: string;
  name: string;
  last_accessed?: Date | null;
  last_scanned: Date;
}

export interface SessionLog {
  id: string;
  machine_id: string;
  project_id?: string | null;
  started_at: Date;
  ended_at?: Date | null;
  duration_seconds?: number | null;
}

// ==================== API请求/响应类型 ====================

export interface RegisterRequest {
  email: string;
  password: string;
  username?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface BindMachineRequest {
  name: string;
  hostname: string;
  machine_token?: string;
  force?: boolean; // 强制重新绑定，覆盖同名主机
}

export interface BindMachineResponse {
  machine_id: string;
  machine_token: string;
}

// ==================== Socket事件类型 ====================

export interface ScanProjectsRequest {
  machine_id: string;
  force_refresh?: boolean;
  request_id?: string;
}

export interface ProjectInfo {
  id?: string;
  path: string;
  name: string;
  last_accessed?: Date | null;
  /** 最近一次会话的最后修改时间（时间戳） */
  lastSessionTime?: number | null;
}

export interface StartSessionRequest {
  machine_id: string;
  project_path: string;
  mode?: 'chat' | 'shell';
  options?: SessionOptions;
  request_id?: string; // 用于响应时精确定位请求者
}

export interface SessionOptions {
  model?: string;
  extra_flags?: string[];
  resume?: string;
}

export interface StartSessionResponse {
  session_id: string;
  project_path: string;
  mode?: 'chat' | 'shell';
}

export interface SessionOutputEvent {
  session_id: string;
  type: 'stdout' | 'stderr' | 'tool_call' | 'permission_request';
  data: string;
  timestamp: Date;
}

export interface SessionInputEvent {
  session_id: string;
  data: string;
}

export interface SessionPermissionAnswerEvent {
  session_id: string;
  approved: boolean;
  message?: string;
}

export interface SessionEndEvent {
  session_id: string;
  exit_code: number;
  ended_at: Date;
  reason?: string;
}

export interface JoinSessionRequest {
  session_id: string;
  machine_id: string;
}

export interface SessionBufferEvent {
  session_id: string;
  lines: string[];
}

export interface SessionResizeEvent {
  session_id: string;
  cols: number;
  rows: number;
}

// ==================== Chat 模式事件类型（SDK） ====================

export interface ChatMessageEvent {
  session_id: string;
  type: 'text' | 'text_delta' | 'tool_use' | 'tool_result' | 'error' | 'complete';
  content?: string;
  toolName?: string;
  toolInput?: string;
  toolId?: string;
  toolResult?: string;
  isError?: boolean;
  modelUsage?: { input: number; output: number };
  timestamp: Date;
}

export interface ChatSendEvent {
  session_id: string;
  content: string;
}

export interface ChatPermissionRequestEvent {
  session_id: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  requestId: string;
}

export interface ChatPermissionAnswerEvent {
  session_id: string;
  requestId: string;
  approved: boolean;
  message?: string;
  updatedInput?: Record<string, unknown>;
}

// ==================== 会话历史类型 ====================

export interface ListSessionsRequest {
  machine_id: string;
  project_path: string;
  request_id?: string;
}

export interface SessionHistoryItem {
  sdkSessionId: string;
  summary: string;
  lastModified: number;
  firstPrompt?: string;
}

export interface GetSessionMessagesRequest {
  machine_id: string;
  project_path: string;
  sdk_session_id: string;
  limit?: number;
  offset?: number;
  request_id: string; // 用于响应时精确定位请求者
}

// 会话消息分页响应
export interface SessionMessagesResponse {
  messages: HistoryMessage[];
  total: number;
  hasMore: boolean;
  offset: number;
  limit: number;
}

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  toolName?: string;
  toolInput?: string;
  toolId?: string;
  toolResult?: string;
  isError?: boolean;
  isToolUse?: boolean;
  timestamp: number;
  order?: number; // 块在原始消息中的顺序，用于同一条消息内的排序
}

export interface ListFilesRequest {
  machine_id: string;
  project_path: string;
  dir_path?: string; // 懒加载：指定要展开的子目录路径，不传则扫描根目录
  request_id?: string;
}

export interface FileTreeItem {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeItem[];
}

export interface ListCommandsRequest {
  machine_id: string;
  project_path: string;
  request_id?: string;
}

export interface SlashCommandItem {
  name: string;
  description: string;
  namespace: 'builtin' | 'project' | 'user' | 'plugin';
  path?: string;
  content?: string;
}

// ==================== 文件操作类型 ====================

export interface ReadFileRequest {
  machine_id: string;
  project_path: string;
  file_path: string;
  request_id?: string;
}

export interface FileContentResponse {
  path: string;
  content: string;
  language: string;
  size: number;
  readonly?: boolean;
}

export interface WriteFileRequest {
  machine_id: string;
  project_path: string;
  file_path: string;
  content: string;
  request_id?: string;
}

export interface CreateFileRequest {
  machine_id: string;
  project_path: string;
  file_path: string;
  type: 'file' | 'directory';
}

export interface DeleteFileRequest {
  machine_id: string;
  project_path: string;
  file_path: string;
}

export interface RenameFileRequest {
  machine_id: string;
  project_path: string;
  old_path: string;
  new_path: string;
}

export interface FileOperationResult {
  success: boolean;
  operation: 'create' | 'delete' | 'rename' | 'write';
  path?: string;
  error?: string;
}

// ==================== 在线状态类型 ====================

export interface OnlineMachineInfo {
  machineId: string;
  lastSeen: Date;
  socketId: string;
}

// ==================== 会话管理类型 ====================

export interface SessionInfo {
  sessionId: string;
  machineId: string;
  projectId?: string;
  projectPath: string;
  startedAt: Date;
  clientsCount: number;
  mode: 'chat' | 'shell';
}

// ==================== Agent 状态类型 ====================

// Agent 连接状态（借鉴 Happy Coder 状态机设计）
export type AgentConnectionState = 'connecting' | 'connected' | 'disconnecting' | 'disconnected';

// Agent 状态变更事件
export interface AgentStatusEvent {
  machineId: string;
  status: 'online' | 'offline';
  connectionState: AgentConnectionState;
  reason?: string;           // 断开原因（可选）
  timestamp: number;
  pendingMessages?: number;  // 离线消息数量（用于显示）
}

// ==================== Git 操作类型 ====================

// Git 状态响应
export interface GitStatus {
  branch: string;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  ahead: number;
  behind: number;
}

// Git 提交记录
export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
}

// Git 状态请求
export interface GitStatusRequest {
  machine_id: string;
  project_path: string;
  request_id: string;
}

// Git 日志请求
export interface GitLogRequest {
  machine_id: string;
  project_path: string;
  limit?: number;
  request_id: string;
}

// Git 暂存请求
export interface GitStageRequest {
  machine_id: string;
  project_path: string;
  file: string;
  request_id: string;
}

// Git 取消暂存请求
export interface GitUnstageRequest {
  machine_id: string;
  project_path: string;
  file: string;
  request_id: string;
}

// Git 提交请求
export interface GitCommitRequest {
  machine_id: string;
  project_path: string;
  message: string;
  request_id: string;
}

// Git 操作响应（通用）
export interface GitOperationResponse {
  request_id: string;
  success: boolean;
  error?: string;
}

// Git 状态响应（带数据）
export interface GitStatusResponse extends GitOperationResponse {
  status?: GitStatus;
}

// Git 日志响应
export interface GitLogResponse extends GitOperationResponse {
  commits?: GitCommit[];
}

// ==================== 路径验证类型 ====================

// 路径验证请求
export interface ValidatePathRequest {
  machine_id: string;
  path: string;
  request_id?: string;
}

// 路径验证响应
export interface ValidatePathResponse {
  request_id: string;
  valid: boolean;
  exists: boolean;
  isDirectory: boolean;
  path?: string;
  error?: string;
}
