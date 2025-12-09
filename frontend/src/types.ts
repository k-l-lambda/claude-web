/**
 * Shared type definitions for frontend
 */

// WebSocket message types
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

export interface MessageBlock {
  role: 'user' | 'assistant';
  content: string | any[];
  timestamp: number;
}

// Terminal message types for display
export type TerminalMessageType =
  | 'user'
  | 'instructor'
  | 'worker'
  | 'thinking'
  | 'system'
  | 'tool_use'
  | 'tool_result'
  | 'error';

export interface TerminalMessage {
  id: string;
  type: TerminalMessageType;
  content: string;
  timestamp: number;
  metadata?: any;
}
