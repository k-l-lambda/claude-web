/**
 * Session-specific type definitions
 */

export interface SessionEvent {
  type: string;
  timestamp: number;
  [key: string]: any;
}

export interface SessionCreatedEvent extends SessionEvent {
  type: 'session_created';
  sessionId: string;
  workDir: string;
  model: string;
}

export interface UserMessageEvent extends SessionEvent {
  type: 'user_message';
  content: string;
}

export interface InstructorMessageEvent extends SessionEvent {
  type: 'instructor_message';
  role: 'assistant';
  content: any; // ContentBlock[]
}

export interface ThinkingEvent extends SessionEvent {
  type: 'instructor_thinking';
  content: string;
}

export interface ToolResultEvent extends SessionEvent {
  type: 'tool_result';
  toolId: string;
  content: any;
}

export interface ToolResultsEvent extends SessionEvent {
  type: 'tool_results';
  results: Array<{ tool_use_id: string; content: string; is_error?: boolean }>;
}

export interface RoundCompleteEvent extends SessionEvent {
  type: 'round_complete';
  round: number;
}

export interface SessionEndedEvent extends SessionEvent {
  type: 'session_ended';
  reason: string;
}

export interface StatusChangeEvent extends SessionEvent {
  type: 'status_change';
  status: string;
}

export interface CLISessionLinkedEvent extends SessionEvent {
  type: 'cli_session_linked';
  cliSessionId: string;
}

export type SessionEventType =
  | SessionCreatedEvent
  | UserMessageEvent
  | InstructorMessageEvent
  | ThinkingEvent
  | ToolResultEvent
  | ToolResultsEvent
  | RoundCompleteEvent
  | SessionEndedEvent
  | StatusChangeEvent
  | CLISessionLinkedEvent;
