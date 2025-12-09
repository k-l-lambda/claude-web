/**
 * Claude API Client wrapper around @anthropic-ai/sdk
 */

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import {
  ClaudeConfig,
  ClaudeMessage,
  ClaudeToolDefinition,
  ClaudeStreamEvent,
  SendMessageOptions
} from './types.js';
import { ClaudeAPIError } from '../types.js';

export class ClaudeClient {
  private client: Anthropic;
  private model: string;
  private enableThinking: boolean;
  private maxTokens: number;

  constructor(clientConfig?: Partial<ClaudeConfig>) {
    const apiKey = clientConfig?.apiKey || config.anthropicApiKey;
    const baseURL = clientConfig?.baseURL || config.anthropicBaseUrl;

    if (!apiKey) {
      throw new Error('Anthropic API key is required');
    }

    this.client = new Anthropic({
      apiKey,
      ...(baseURL && { baseURL })
    });

    this.model = clientConfig?.model || config.claudeModel;
    this.enableThinking = clientConfig?.enableThinking ?? config.enableThinking;
    this.maxTokens = clientConfig?.maxTokens || 8192;

    logger.info(`Claude client initialized with model: ${this.model}${baseURL ? `, baseURL: ${baseURL}` : ''}`);
  }

  /**
   * Send a message and get a response (non-streaming)
   */
  async sendMessage(options: SendMessageOptions): Promise<Anthropic.Message> {
    const { messages, system, tools, maxTokens, signal } = options;

    try {
      const params: Anthropic.MessageCreateParams = {
        model: this.model,
        max_tokens: maxTokens || this.maxTokens,
        messages: this.formatMessages(messages),
        system: system,
        tools: tools as any
      };

      // Add thinking if enabled
      if (this.enableThinking) {
        (params as any).thinking = {
          type: 'enabled',
          budget_tokens: 4096
        };
      }

      const response = await this.client.messages.create(params, {
        signal
      });

      return response;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Send a message with streaming response
   */
  async sendMessageStream(options: SendMessageOptions): Promise<Anthropic.Message> {
    const { messages, system, tools, maxTokens, onStream, signal } = options;

    try {
      const params: Anthropic.MessageCreateParams = {
        model: this.model,
        max_tokens: maxTokens || this.maxTokens,
        messages: this.formatMessages(messages),
        system: system,
        tools: tools as any,
        stream: true
      };

      // Add thinking if enabled
      if (this.enableThinking) {
        (params as any).thinking = {
          type: 'enabled',
          budget_tokens: 4096
        };
      }

      const stream = this.client.messages.stream(params, { signal });

      let thinkingContent = '';
      let textContent = '';
      let currentToolUse: { id: string; name: string; input: string } | null = null;

      stream.on('text', (text) => {
        textContent += text;
        if (onStream) {
          onStream({ type: 'text', content: text });
        }
      });

      // Handle thinking blocks if available
      (stream as any).on('contentBlockStart', (event: any) => {
        if (event.content_block?.type === 'thinking') {
          thinkingContent = '';
        } else if (event.content_block?.type === 'tool_use') {
          currentToolUse = {
            id: event.content_block.id,
            name: event.content_block.name,
            input: ''
          };
        }
      });

      (stream as any).on('contentBlockDelta', (event: any) => {
        if (event.delta?.type === 'thinking_delta') {
          thinkingContent += event.delta.thinking;
          if (onStream) {
            onStream({ type: 'thinking', content: event.delta.thinking });
          }
        } else if (event.delta?.type === 'input_json_delta' && currentToolUse) {
          currentToolUse.input += event.delta.partial_json;
        }
      });

      (stream as any).on('contentBlockStop', (event: any) => {
        if (currentToolUse) {
          try {
            const parsedInput = JSON.parse(currentToolUse.input);
            if (onStream) {
              onStream({
                type: 'tool_use',
                toolUse: {
                  id: currentToolUse.id,
                  name: currentToolUse.name,
                  input: parsedInput
                }
              });
            }
          } catch (e) {
            logger.warn('Failed to parse tool input:', currentToolUse.input);
          }
          currentToolUse = null;
        }
      });

      // Wait for the stream to complete
      const finalMessage = await stream.finalMessage();

      if (onStream) {
        onStream({ type: 'done', message: finalMessage });
      }

      return finalMessage;
    } catch (error) {
      if (onStream) {
        onStream({ type: 'error', error: String(error) });
      }
      throw this.handleError(error);
    }
  }

  /**
   * Format messages for the API
   */
  private formatMessages(messages: ClaudeMessage[]): Anthropic.MessageParam[] {
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content as any
    }));
  }

  /**
   * Handle API errors
   */
  private handleError(error: any): ClaudeAPIError {
    if (error instanceof Anthropic.APIError) {
      const status = error.status;
      let apiType = 'unknown';
      let retryAfter: number | undefined;

      if (status === 429) {
        apiType = 'rate_limit';
        // Try to extract retry-after from headers
        retryAfter = 60; // Default
      } else if (status === 400) {
        apiType = 'invalid_request';
      } else if (status >= 500) {
        apiType = 'server_error';
      }

      return new ClaudeAPIError(
        error.message,
        status,
        apiType,
        retryAfter
      );
    }

    if (error.name === 'AbortError') {
      return new ClaudeAPIError('Request aborted', undefined, 'aborted');
    }

    return new ClaudeAPIError(
      error.message || 'Unknown error',
      undefined,
      'unknown'
    );
  }

  /**
   * Get current model
   */
  getModel(): string {
    return this.model;
  }

  /**
   * Set model
   */
  setModel(model: string): void {
    this.model = model;
    logger.info(`Claude client model changed to: ${model}`);
  }

  /**
   * Check if thinking is enabled
   */
  isThinkingEnabled(): boolean {
    return this.enableThinking;
  }
}

// Export factory function
export function createClaudeClient(options?: Partial<ClaudeConfig>): ClaudeClient {
  return new ClaudeClient(options);
}

// Export singleton instance
export const claudeClient = new ClaudeClient();
