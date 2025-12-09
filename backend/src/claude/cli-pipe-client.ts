/**
 * Claude CLI Pipe Client - wraps the official claude CLI in pipe mode
 *
 * Uses: claude --print --input-format stream-json --output-format stream-json
 *
 * This provides an alternative backend that leverages the official CLI's
 * full feature set (tools, MCP servers, session management).
 */

import { spawn, ChildProcess } from 'child_process';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import type { ClaudeMessage, ClaudeStreamEvent, SendMessageOptions } from './types.js';

// CLI stream-json message types
interface CLIUserMessage {
  type: 'user';
  message: {
    role: 'user';
    content: string;
  };
}

interface CLIAssistantMessage {
  type: 'assistant';
  message: {
    content: Array<{
      type: 'text' | 'tool_use' | 'thinking';
      text?: string;
      id?: string;
      name?: string;
      input?: any;
      thinking?: string;
    }>;
    stop_reason?: string;
  };
  session_id?: string;
}

interface CLIToolResultMessage {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

interface CLISystemMessage {
  type: 'system';
  content: string;
}

interface CLIResultMessage {
  type: 'result';
  result?: string;
  session_id?: string;
  is_error?: boolean;
  error?: string;
}

type CLIOutputMessage = CLIAssistantMessage | CLIResultMessage | { type: string; [key: string]: any };

export interface CLIPipeClientConfig {
  claudePath?: string;  // Path to claude CLI, defaults to 'claude'
  workDir?: string;
  model?: string;
  sessionId?: string;
  dangerouslySkipPermissions?: boolean;
}

export class CLIPipeClient {
  private claudePath: string;
  private workDir: string;
  private model: string;
  private dangerouslySkipPermissions: boolean;
  private currentProcess: ChildProcess | null = null;
  private sessionId: string | null = null;

  constructor(clientConfig?: CLIPipeClientConfig) {
    this.claudePath = clientConfig?.claudePath || 'claude';
    this.workDir = clientConfig?.workDir || config.workDir;
    this.model = clientConfig?.model || config.claudeModel;
    this.sessionId = clientConfig?.sessionId || null;
    this.dangerouslySkipPermissions = clientConfig?.dangerouslySkipPermissions ?? true;

    logger.info(`CLI Pipe client initialized - claude path: ${this.claudePath}, model: ${this.model}`);
  }

  /**
   * Send a message using claude CLI in pipe mode
   * Note: This is a simpler interface - the CLI handles tools internally
   */
  async sendMessage(prompt: string, options?: {
    sessionId?: string;
    signal?: AbortSignal;
    onStream?: (event: ClaudeStreamEvent) => void;
  }): Promise<{ text: string; sessionId?: string }> {
    const { sessionId, signal, onStream } = options || {};

    return new Promise((resolve, reject) => {
      const args = this.buildArgs(sessionId);

      logger.debug(`Spawning claude CLI: ${this.claudePath} ${args.join(' ')}`);

      const proc = spawn(this.claudePath, args, {
        cwd: this.workDir,
        env: {
          ...process.env,
          ANTHROPIC_MODEL: this.model
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.currentProcess = proc;

      // Handle abort signal
      if (signal) {
        signal.addEventListener('abort', () => {
          proc.kill('SIGINT');
          reject(new DOMException('Aborted', 'AbortError'));
        });
      }

      let stdout = '';
      let stderr = '';
      let resultText = '';
      let resultSessionId: string | undefined;
      let buffer = '';

      proc.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stdout += chunk;
        buffer += chunk;

        // Process complete JSON lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const msg = JSON.parse(line) as CLIOutputMessage;
            this.handleStreamMessage(msg, onStream);

            // Extract result
            if (msg.type === 'result') {
              const resultMsg = msg as CLIResultMessage;
              if (resultMsg.is_error) {
                const errorDetail = resultMsg.error || resultMsg.result || 'Unknown CLI error';
                logger.error(`CLI error: ${errorDetail}`);
                reject(new Error(`CLI error: ${errorDetail}`));
                return;
              }
              resultText = resultMsg.result || '';
              resultSessionId = resultMsg.session_id;
            } else if (msg.type === 'assistant') {
              const assistantMsg = msg as CLIAssistantMessage;
              // Extract text from assistant message
              const texts = assistantMsg.message?.content
                ?.filter(b => b.type === 'text')
                ?.map(b => b.text)
                ?.join('') || '';
              if (texts) {
                resultText = texts;
              }
              if (assistantMsg.session_id) {
                resultSessionId = assistantMsg.session_id;
              }
            }
          } catch (e) {
            logger.debug(`Non-JSON line from CLI: ${line}`);
          }
        }
      });

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
        logger.debug(`CLI stderr: ${data.toString()}`);
      });

      proc.on('close', (code) => {
        this.currentProcess = null;

        if (code === 0 || resultText) {
          this.sessionId = resultSessionId || this.sessionId;
          resolve({
            text: resultText,
            sessionId: resultSessionId
          });
        } else {
          reject(new Error(`CLI exited with code ${code}: ${stderr}`));
        }
      });

      proc.on('error', (err) => {
        this.currentProcess = null;
        reject(err);
      });

      // Send the prompt as stream-json input
      const inputMessage: CLIUserMessage = {
        type: 'user',
        message: {
          role: 'user',
          content: prompt
        }
      };

      proc.stdin?.write(JSON.stringify(inputMessage) + '\n');
      proc.stdin?.end();
    });
  }

  /**
   * Send message with conversation context (for multi-turn)
   * This spawns a new process with --resume if sessionId exists
   */
  async sendMessageWithContext(
    messages: ClaudeMessage[],
    options?: {
      system?: string;
      signal?: AbortSignal;
      onStream?: (event: ClaudeStreamEvent) => void;
    }
  ): Promise<{ text: string; sessionId?: string }> {
    // For CLI pipe mode, we need to either:
    // 1. Use --resume with a session ID for multi-turn
    // 2. Or concatenate messages into a single prompt

    // Get the last user message
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    if (!lastUserMessage) {
      throw new Error('No user message in conversation');
    }

    const prompt = typeof lastUserMessage.content === 'string'
      ? lastUserMessage.content
      : JSON.stringify(lastUserMessage.content);

    return this.sendMessage(prompt, {
      sessionId: this.sessionId || undefined,
      signal: options?.signal,
      onStream: options?.onStream
    });
  }

  /**
   * Build CLI arguments
   */
  private buildArgs(sessionId?: string): string[] {
    const args: string[] = [
      '--print',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose'  // Required for stream-json output
    ];

    // Resume session if available
    if (sessionId || this.sessionId) {
      args.push('--resume', sessionId || this.sessionId!);
    }

    // Skip permissions for automated use
    if (this.dangerouslySkipPermissions) {
      args.push('--dangerously-skip-permissions');
    }

    return args;
  }

  /**
   * Handle streaming message from CLI
   */
  private handleStreamMessage(msg: CLIOutputMessage, onStream?: (event: ClaudeStreamEvent) => void): void {
    if (!onStream) return;

    switch (msg.type) {
      case 'assistant': {
        const assistantMsg = msg as CLIAssistantMessage;
        for (const block of assistantMsg.message?.content || []) {
          if (block.type === 'text' && block.text) {
            onStream({ type: 'text', content: block.text });
          } else if (block.type === 'thinking' && block.thinking) {
            onStream({ type: 'thinking', content: block.thinking });
          } else if (block.type === 'tool_use') {
            onStream({
              type: 'tool_use',
              toolUse: {
                id: block.id || '',
                name: block.name || '',
                input: block.input
              }
            });
          }
        }
        break;
      }

      case 'result': {
        const resultMsg = msg as CLIResultMessage;
        if (resultMsg.is_error) {
          onStream({ type: 'error', error: resultMsg.error || 'Unknown error' });
        }
        break;
      }

      default:
        logger.debug(`Unhandled CLI message type: ${msg.type}`);
    }
  }

  /**
   * Interrupt current execution
   */
  interrupt(): void {
    if (this.currentProcess) {
      this.currentProcess.kill('SIGINT');
      this.currentProcess = null;
    }
  }

  /**
   * Get current session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Set session ID (for resuming)
   */
  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  /**
   * Get model
   */
  getModel(): string {
    return this.model;
  }

  /**
   * Set model
   */
  setModel(model: string): void {
    this.model = model;
    logger.info(`CLI Pipe client model changed to: ${model}`);
  }
}

// Export factory function
export function createCLIPipeClient(options?: CLIPipeClientConfig): CLIPipeClient {
  return new CLIPipeClient(options);
}
