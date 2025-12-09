/**
 * Claude-specific type definitions
 */

import Anthropic from '@anthropic-ai/sdk';

export interface ClaudeConfig {
  apiKey: string;
  baseURL?: string;
  model: string;
  enableThinking: boolean;
  maxTokens?: number;
}

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | Anthropic.ContentBlock[];
}

export interface ClaudeToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface ClaudeStreamEvent {
  type: 'thinking' | 'text' | 'tool_use' | 'done' | 'error';
  content?: string;
  toolUse?: {
    id: string;
    name: string;
    input: any;
  };
  message?: Anthropic.Message;
  error?: string;
}

export interface SendMessageOptions {
  messages: ClaudeMessage[];
  system?: string;
  tools?: ClaudeToolDefinition[];
  maxTokens?: number;
  onStream?: (event: ClaudeStreamEvent) => void;
  signal?: AbortSignal;
}
