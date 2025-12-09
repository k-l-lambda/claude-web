/**
 * CLI Pipe Orchestrator - manages conversation flow using the Claude CLI
 *
 * Unlike the SDK orchestrator which implements a dual-agent pattern,
 * the CLI orchestrator delegates all tool execution to the CLI itself,
 * acting more as a simple proxy.
 */

import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { sessionManager } from '../session/manager.js';
import { createCLIPipeClient, CLIPipeClient } from '../claude/cli-pipe-client.js';
import { wsHandler } from '../websocket/handler.js';
import type { SessionState, ServerMessage } from '../types.js';
import type { ClaudeStreamEvent } from '../claude/types.js';

interface CLIRunContext {
  sessionId: string;
  clientId: string;
  abortController: AbortController;
  cliClient: CLIPipeClient;
  onMessage?: (msg: ServerMessage) => void;  // Optional callback for HTTP API
}

class CLIPipeOrchestrator {
  private activeRuns: Map<string, CLIRunContext> = new Map();

  async run(sessionId: string, clientId: string): Promise<void> {
    return this.runWithCallback(sessionId, clientId);
  }

  /**
   * Run orchestrator with optional message callback
   * Used by HTTP API for sync/streaming responses
   */
  async runWithCallback(
    sessionId: string,
    clientId: string,
    onMessage?: (msg: ServerMessage) => void
  ): Promise<void> {
    // Check if already running
    if (this.activeRuns.has(sessionId)) {
      logger.warn(`Session ${sessionId} is already running`);
      return;
    }

    const session = sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Acquire lock
    if (!sessionManager.acquireLock(sessionId)) {
      throw new Error('Session is locked');
    }

    // Create CLI client for this session
    const cliClient = createCLIPipeClient({
      workDir: session.workDir,
      model: session.model,
      sessionId: session.cliSessionId  // Resume CLI session if exists
    });

    const abortController = new AbortController();
    const context: CLIRunContext = {
      sessionId,
      clientId,
      abortController,
      cliClient,
      onMessage
    };

    this.activeRuns.set(sessionId, context);

    try {
      await this.processUserInput(session, context);
    } catch (error: unknown) {
      const err = error as Error;
      if (err.name === 'AbortError') {
        logger.info(`Session ${sessionId} interrupted`);
        this.sendMessage(sessionId, {
          type: 'system_message',
          content: 'Interrupted by user',
          level: 'warning',
          timestamp: Date.now()
        });
      } else {
        logger.error(`CLI Orchestrator error: ${error}`);
        this.sendMessage(sessionId, {
          type: 'error',
          message: `Error: ${err.message}`
        });
      }
    } finally {
      sessionManager.releaseLock(sessionId);
      this.activeRuns.delete(sessionId);
    }
  }

  interrupt(sessionId: string): void {
    const context = this.activeRuns.get(sessionId);
    if (context) {
      context.abortController.abort();
      context.cliClient.interrupt();
    }
  }

  private async processUserInput(session: SessionState, context: CLIRunContext): Promise<void> {
    const { sessionId, abortController, cliClient } = context;

    // Get the last user message from history
    const lastMessage = session.instructorHistory[session.instructorHistory.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
      throw new Error('No user message to process');
    }

    const userPrompt = typeof lastMessage.content === 'string'
      ? lastMessage.content
      : JSON.stringify(lastMessage.content);

    // Update status
    sessionManager.updateStatus(sessionId, 'active');
    this.sendStatusUpdate(session);

    // Stream handler to relay CLI output to WebSocket
    const onStream = (event: ClaudeStreamEvent) => {
      switch (event.type) {
        case 'thinking':
          this.sendMessage(sessionId, {
            type: 'thinking',
            content: event.content || '',
            timestamp: Date.now()
          });
          break;

        case 'text':
          // Accumulate text - will send full response at end
          // For now, we could send partial updates
          break;

        case 'tool_use':
          if (event.toolUse) {
            sessionManager.updateStatus(sessionId, 'executing');
            this.sendStatusUpdate(session);
            this.sendMessage(sessionId, {
              type: 'tool_use',
              tool: event.toolUse.name,
              input: event.toolUse.input,
              timestamp: Date.now()
            });
          }
          break;

        case 'error':
          this.sendMessage(sessionId, {
            type: 'error',
            message: event.error || 'Unknown error'
          });
          break;
      }
    };

    try {
      // Send to CLI and get response
      const result = await cliClient.sendMessage(userPrompt, {
        signal: abortController.signal,
        onStream
      });

      // Save CLI session ID for future resume
      if (result.sessionId) {
        sessionManager.setCLISessionId(sessionId, result.sessionId);
      }

      // Add assistant response to history
      if (result.text) {
        sessionManager.addInstructorMessage(sessionId, [{
          type: 'text',
          text: result.text
        }]);

        // Send the response to client
        this.sendMessage(sessionId, {
          type: 'instructor_message',
          content: result.text,
          timestamp: Date.now()
        });
      }

      // Increment round
      sessionManager.incrementRound(sessionId);
      this.sendMessage(sessionId, {
        type: 'round_complete',
        roundNumber: session.roundCount,
        timestamp: Date.now()
      });

      // CLI process completed - waiting for next input
      sessionManager.updateStatus(sessionId, 'waiting');
      this.sendMessage(sessionId, {
        type: 'done',
        timestamp: Date.now()
      });
      this.sendStatusUpdate(session);

    } catch (error) {
      throw error;
    }
  }

  private sendMessage(sessionId: string, message: ServerMessage): void {
    // Check if there's an active context with callback
    const context = this.activeRuns.get(sessionId);
    if (context?.onMessage) {
      context.onMessage(message);
    }
    // Also send via WebSocket for any connected clients
    wsHandler.sendToSession(sessionId, message);
  }

  private sendStatusUpdate(session: SessionState): void {
    this.sendMessage(session.sessionId, {
      type: 'status_update',
      sessionId: session.sessionId,
      status: session.status,
      round: session.roundCount,
      model: session.model
    });
  }
}

export const cliPipeOrchestrator = new CLIPipeOrchestrator();
