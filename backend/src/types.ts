/**
 * Core type definitions for Claude Code Web backend
 */

import Anthropic from '@anthropic-ai/sdk';

// ============================================================================
// Configuration
// ============================================================================

export type BackendType = 'sdk' | 'cli-pipe';

export interface Config {
  port: number;
  authPassword: string;
  anthropicApiKey: string;
  claudeModel: string;
  enableThinking: boolean;
  workDir: string;
  sessionStorageDir: string;
  sessionTimeoutMinutes: number;
  allowedTools: string[];
  askUserTools: string[];
  deniedTools: string[];
  bashTimeoutSeconds: number;
  bashMaxOutputSize: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  logDir: string;
  backendType: BackendType;  // 'sdk' or 'cli-pipe'
  claudePath?: string;  // Path to claude CLI (for cli-pipe backend)
}

// ============================================================================
// WebSocket Messages
// ============================================================================

// Client → Server messages
export type ClientMessage =
  | { type: 'auth'; password: string }
  | { type: 'create_session'; workDir: string; instruction?: string }
  | { type: 'resume_session'; sessionId: string }
  | { type: 'send_input'; sessionId: string; content: string }
  | { type: 'interrupt'; sessionId: string }
  | { type: 'list_sessions' }
  | { type: 'get_session'; sessionId: string }
  | { type: 'end_session'; sessionId: string }
  | { type: 'ping' };

// Server → Client messages
export type ServerMessage =
  | { type: 'auth_success'; userId: string }
  | { type: 'auth_failed'; reason: string }
  | { type: 'session_created'; sessionId: string; status: SessionStatus }
  | { type: 'session_resumed'; sessionId: string; history: MessageBlock[] }
  | { type: 'session_ended'; sessionId: string; reason: string }
  | { type: 'session_list'; sessions: SessionInfo[] }
  | { type: 'session_info'; session: SessionInfo }
  | { type: 'thinking'; content: string; timestamp: number }
  | { type: 'instructor_message'; content: string; timestamp: number }
  | { type: 'worker_message'; content: string; timestamp: number }
  | { type: 'system_message'; content: string; level: 'info' | 'warning' | 'error'; timestamp: number }
  | { type: 'tool_use'; tool: string; input: any; timestamp: number }
  | { type: 'tool_result'; tool: string; output: any; success: boolean; timestamp: number }
  | { type: 'waiting_input'; prompt: string; timestamp: number }
  | { type: 'round_complete'; roundNumber: number; timestamp: number }
  | { type: 'done'; timestamp: number }
  | { type: 'status_update'; sessionId: string; status: SessionStatus; round: number; model: string }
  | { type: 'error'; message: string; details?: any }
  | { type: 'pong' };

// ============================================================================
// Session Types
// ============================================================================

export type SessionStatus =
  | 'initializing'
  | 'active'
  | 'thinking'
  | 'executing'
  | 'waiting'
  | 'paused'
  | 'ended';

export interface SessionInfo {
  sessionId: string;
  workDir: string;
  status: SessionStatus;
  createdAt: string;
  lastActivity: string;
  roundCount: number;
  model: string;
}

export interface SessionState {
  sessionId: string;
  workDir: string;
  status: SessionStatus;
  createdAt: number;
  lastActivity: number;
  roundCount: number;
  model: string;
  instructorHistory: MessageBlock[];
  workerContext?: any; // Transient, not persisted
  cliSessionId?: string; // For CLI pipe backend - maps to claude CLI session
}

export interface MessageBlock {
  role: 'user' | 'assistant';
  content: string | Anthropic.ContentBlock[];
  timestamp: number;
}

// ============================================================================
// Agent Types
// ============================================================================

export interface AgentResponse {
  thinking?: string;
  content: string;
  toolUse?: ToolCall[];
  stopReason?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input: any;
}

export interface ToolResult {
  tool_use_id: string;
  content: string | any;
  is_error?: boolean;
}

// ============================================================================
// Tool System Types
// ============================================================================

export enum PermissionLevel {
  ALWAYS_ALLOWED = 'always_allowed',
  ASK_USER = 'ask_user',
  DENIED = 'denied'
}

export interface ToolPermissions {
  read_file: PermissionLevel;
  write_file: PermissionLevel;
  edit_file: PermissionLevel;
  glob: PermissionLevel;
  grep: PermissionLevel;
  bash_command: PermissionLevel;
  git_status: PermissionLevel;
  git_diff: PermissionLevel;
  git_commit: PermissionLevel;
  git_push: PermissionLevel;
}

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
}

export interface ToolExecutionResult {
  success: boolean;
  output?: any;
  error?: string;
}

// ============================================================================
// File Operation Types
// ============================================================================

export interface ReadFileInput {
  path: string;
  offset?: number;
  limit?: number;
}

export interface WriteFileInput {
  path: string;
  content: string;
}

export interface EditFileInput {
  path: string;
  old_string: string;
  new_string: string;
}

export interface GlobInput {
  pattern: string;
  path?: string;
}

export interface GrepInput {
  pattern: string;
  path?: string;
  glob?: string;
  output_mode?: 'content' | 'files_with_matches' | 'count';
}

export interface BashInput {
  command: string;
  timeout?: number;
}

export interface GitInput {
  command: string;
  args?: string[];
}

// ============================================================================
// Error Types
// ============================================================================

export class ClaudeCodeError extends Error {
  constructor(message: string, public code?: string, public details?: any) {
    super(message);
    this.name = 'ClaudeCodeError';
  }
}

export class AuthError extends ClaudeCodeError {
  constructor(message: string) {
    super(message, 'AUTH_ERROR');
    this.name = 'AuthError';
  }
}

export class SessionError extends ClaudeCodeError {
  constructor(message: string, code?: string) {
    super(message, code || 'SESSION_ERROR');
    this.name = 'SessionError';
  }
}

export class ToolExecutionError extends ClaudeCodeError {
  constructor(message: string, public toolName: string) {
    super(message, 'TOOL_EXECUTION_ERROR');
    this.name = 'ToolExecutionError';
  }
}

export class ClaudeAPIError extends ClaudeCodeError {
  constructor(
    message: string,
    public status?: number,
    public apiType?: string,
    public retryAfter?: number
  ) {
    super(message, 'CLAUDE_API_ERROR');
    this.name = 'ClaudeAPIError';
  }
}
