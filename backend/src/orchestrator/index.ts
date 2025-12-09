/**
 * Orchestrator - manages the dual-agent conversation flow
 */

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { sessionManager } from '../session/manager.js';
import { claudeClient } from '../claude/client.js';
import { toolExecutor } from '../tools/executor.js';
import { getInstructorPrompt, getWorkerPrompt } from '../claude/prompts.js';
import { instructorTools, workerTools } from '../tools/definitions.js';
import { wsHandler } from '../websocket/handler.js';
import type { SessionState, ServerMessage, ToolResult } from '../types.js';
import type { ClaudeMessage, ClaudeStreamEvent } from '../claude/types.js';

interface RunContext {
  sessionId: string;
  clientId: string;
  abortController: AbortController;
  onMessage?: (msg: ServerMessage) => void;  // Optional callback for HTTP API
}

class Orchestrator {
  private activeRuns: Map<string, RunContext> = new Map();
  private maxRounds: number = 50;

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

    const abortController = new AbortController();
    const context: RunContext = { sessionId, clientId, abortController, onMessage };
    this.activeRuns.set(sessionId, context);

    try {
      await this.runInstructorLoop(session, context);
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
        logger.error(`Orchestrator error: ${error}`);
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
    }
  }

  private async runInstructorLoop(session: SessionState, context: RunContext): Promise<void> {
    const { sessionId, abortController } = context;

    while (session.roundCount < this.maxRounds) {
      if (abortController.signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      // Update status
      sessionManager.updateStatus(sessionId, 'thinking');
      this.sendStatusUpdate(session);

      // Call instructor
      const instructorResult = await this.callInstructor(session, abortController.signal);

      if (instructorResult.needsUserInput) {
        // Instructor is waiting for user input
        sessionManager.updateStatus(sessionId, 'waiting');
        this.sendMessage(sessionId, {
          type: 'waiting_input',
          prompt: instructorResult.prompt || 'Waiting for your input...',
          timestamp: Date.now()
        });
        this.sendStatusUpdate(session);
        return;
      }

      if (instructorResult.completed) {
        // Task completed
        sessionManager.updateStatus(sessionId, 'waiting');
        this.sendMessage(sessionId, {
          type: 'done',
          timestamp: Date.now()
        });
        this.sendStatusUpdate(session);
        return;
      }

      // Increment round
      sessionManager.incrementRound(sessionId);
      this.sendMessage(sessionId, {
        type: 'round_complete',
        roundNumber: session.roundCount,
        timestamp: Date.now()
      });
    }

    // Max rounds reached
    logger.warn(`Session ${sessionId} reached max rounds`);
    this.sendMessage(sessionId, {
      type: 'system_message',
      content: 'Maximum rounds reached. Please provide new instructions.',
      level: 'warning',
      timestamp: Date.now()
    });
    sessionManager.updateStatus(sessionId, 'waiting');
    this.sendStatusUpdate(session);
  }

  private async callInstructor(session: SessionState, signal: AbortSignal): Promise<{ needsUserInput: boolean; completed: boolean; prompt?: string }> {
    const systemPrompt = getInstructorPrompt(session.workDir);

    // Convert session history to ClaudeMessage format
    const messages: ClaudeMessage[] = session.instructorHistory.map(m => ({
      role: m.role,
      content: m.content
    }));

    const response = await claudeClient.sendMessageStream({
      system: systemPrompt,
      messages,
      tools: instructorTools,
      signal,
      onStream: (event: ClaudeStreamEvent) => {
        if (event.type === 'thinking') {
          this.sendMessage(session.sessionId, {
            type: 'thinking',
            content: event.content || '',
            timestamp: Date.now()
          });
        }
      }
    });

    // Extract text content
    const textContent = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('');

    if (textContent) {
      this.sendMessage(session.sessionId, {
        type: 'instructor_message',
        content: textContent,
        timestamp: Date.now()
      });
    }

    // Save response to history
    sessionManager.addInstructorMessage(session.sessionId, response.content);

    // Check for tool use
    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );

    if (toolUseBlocks.length === 0) {
      // No tool use - check stop reason
      if (response.stop_reason === 'end_turn') {
        return { needsUserInput: true, completed: false, prompt: textContent };
      }
      return { needsUserInput: false, completed: true };
    }

    // Process tool calls
    const toolResults: ToolResult[] = [];

    for (const toolUse of toolUseBlocks) {
      if (signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      this.sendMessage(session.sessionId, {
        type: 'tool_use',
        tool: toolUse.name,
        input: toolUse.input,
        timestamp: Date.now()
      });

      // Handle special tools
      if (toolUse.name === 'call_worker') {
        // Execute worker agent
        sessionManager.updateStatus(session.sessionId, 'executing');
        this.sendStatusUpdate(session);

        const workerResult = await this.callWorker(session, toolUse.input as { task: string }, signal);

        toolResults.push({
          tool_use_id: toolUse.id,
          content: workerResult,
          is_error: false
        });

        this.sendMessage(session.sessionId, {
          type: 'tool_result',
          tool: toolUse.name,
          output: workerResult,
          success: true,
          timestamp: Date.now()
        });
      } else if (toolUse.name === 'tell_worker') {
        // Just acknowledge the instruction
        toolResults.push({
          tool_use_id: toolUse.id,
          content: 'Instruction noted.',
          is_error: false
        });
      } else {
        // Execute regular tool
        sessionManager.updateStatus(session.sessionId, 'executing');
        this.sendStatusUpdate(session);

        const result = await toolExecutor.execute({
          id: toolUse.id,
          name: toolUse.name,
          input: toolUse.input as Record<string, unknown>
        });

        toolResults.push(result);

        this.sendMessage(session.sessionId, {
          type: 'tool_result',
          tool: toolUse.name,
          output: result.content,
          success: !result.is_error,
          timestamp: Date.now()
        });
      }
    }

    // Add tool results to history
    sessionManager.addToolResults(session.sessionId, toolResults);

    return { needsUserInput: false, completed: false };
  }

  private async callWorker(session: SessionState, input: { task: string }, signal: AbortSignal): Promise<string> {
    const systemPrompt = getWorkerPrompt(session.workDir);
    const workerHistory: ClaudeMessage[] = [
      { role: 'user', content: input.task }
    ];

    let maxIterations = 20;
    let iteration = 0;
    let finalResponse = '';

    while (iteration < maxIterations) {
      if (signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      iteration++;

      const response = await claudeClient.sendMessageStream({
        system: systemPrompt,
        messages: workerHistory,
        tools: workerTools,
        signal,
        onStream: (event: ClaudeStreamEvent) => {
          if (event.type === 'thinking') {
            this.sendMessage(session.sessionId, {
              type: 'thinking',
              content: `[Worker] ${event.content || ''}`,
              timestamp: Date.now()
            });
          }
        }
      });

      // Extract text
      const textContent = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map(block => block.text)
        .join('');

      if (textContent) {
        this.sendMessage(session.sessionId, {
          type: 'worker_message',
          content: textContent,
          timestamp: Date.now()
        });
        finalResponse = textContent;
      }

      // Add to worker history
      workerHistory.push({
        role: 'assistant',
        content: response.content
      });

      // Check for tool use
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      if (toolUseBlocks.length === 0) {
        // Worker is done
        break;
      }

      // Execute tools
      const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = [];

      for (const toolUse of toolUseBlocks) {
        if (signal.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }

        this.sendMessage(session.sessionId, {
          type: 'tool_use',
          tool: `[Worker] ${toolUse.name}`,
          input: toolUse.input,
          timestamp: Date.now()
        });

        const result = await toolExecutor.execute({
          id: toolUse.id,
          name: toolUse.name,
          input: toolUse.input as Record<string, unknown>
        });

        toolResults.push({
          type: 'tool_result',
          tool_use_id: result.tool_use_id,
          content: result.content
        });

        this.sendMessage(session.sessionId, {
          type: 'tool_result',
          tool: toolUse.name,
          output: result.content,
          success: !result.is_error,
          timestamp: Date.now()
        });
      }

      // Add tool results to worker history as a user message with tool results
      workerHistory.push({
        role: 'user',
        content: toolResults as unknown as Anthropic.ContentBlock[]
      });
    }

    return finalResponse || 'Worker completed task.';
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

export const orchestrator = new Orchestrator();
