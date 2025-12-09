/**
 * HTTP API Routes for Claude Code Web
 *
 * Provides REST endpoints alongside WebSocket for agent usage.
 */

import { Router, Request, Response } from 'express';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { sessionManager } from '../session/manager.js';
import { orchestrator } from '../orchestrator/index.js';
import { cliPipeOrchestrator } from '../orchestrator/cli-pipe.js';
import { apiKeyAuth } from './middleware.js';
import type { ServerMessage, SessionInfo } from '../types.js';

const router = Router();

// Apply auth to all routes
router.use(apiKeyAuth);

// Select orchestrator based on config
const getOrchestrator = () => {
  return config.backendType === 'cli-pipe' ? cliPipeOrchestrator : orchestrator;
};

// ============================================================================
// Session Management
// ============================================================================

/**
 * POST /api/sessions - Create new session
 */
router.post('/sessions', async (req: Request, res: Response) => {
  try {
    const { workDir, model, instruction } = req.body;

    if (!workDir) {
      res.status(400).json({ error: 'workDir is required' });
      return;
    }

    const session = sessionManager.createSession(workDir, model || config.claudeModel);

    logger.info(`API: Created session ${session.sessionId} for workDir: ${workDir}`);

    // If initial instruction provided, process it synchronously
    if (instruction) {
      sessionManager.addUserMessage(session.sessionId, instruction);

      const result = await runOrchestratorSync(session.sessionId);

      res.json({
        sessionId: session.sessionId,
        status: session.status,
        workDir: session.workDir,
        model: session.model,
        response: result.response,
        toolCalls: result.toolCalls,
        roundCount: session.roundCount
      });
      return;
    }

    res.json({
      sessionId: session.sessionId,
      status: session.status,
      workDir: session.workDir,
      model: session.model
    });
  } catch (error) {
    logger.error(`API: Failed to create session: ${error}`);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/sessions - List all sessions
 */
router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const sessions = await sessionManager.listSessions();
    res.json({ sessions });
  } catch (error) {
    logger.error(`API: Failed to list sessions: ${error}`);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/sessions/:id - Get session details
 */
router.get('/sessions/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const session = await sessionManager.loadSession(id);

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const info: SessionInfo = {
      sessionId: session.sessionId,
      workDir: session.workDir,
      status: session.status,
      createdAt: new Date(session.createdAt).toISOString(),
      lastActivity: new Date(session.lastActivity).toISOString(),
      roundCount: session.roundCount,
      model: session.model
    };

    res.json({ session: info, history: session.instructorHistory });
  } catch (error) {
    logger.error(`API: Failed to get session: ${error}`);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * DELETE /api/sessions/:id - End/delete session
 */
router.delete('/sessions/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const session = await sessionManager.loadSession(id);

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    sessionManager.endSession(id, 'API request');
    logger.info(`API: Ended session ${id}`);

    res.json({ success: true, sessionId: id });
  } catch (error) {
    logger.error(`API: Failed to end session: ${error}`);
    res.status(500).json({ error: (error as Error).message });
  }
});

// ============================================================================
// Chat - Synchronous
// ============================================================================

/**
 * POST /api/sessions/:id/messages - Send message and wait for response
 */
router.post('/sessions/:id/messages', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    if (!content) {
      res.status(400).json({ error: 'content is required' });
      return;
    }

    const session = await sessionManager.loadSession(id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Add user message
    sessionManager.addUserMessage(id, content);

    // Run orchestrator and collect results
    const result = await runOrchestratorSync(id);

    // Reload session for updated state
    const updatedSession = sessionManager.getSession(id);

    res.json({
      sessionId: id,
      status: updatedSession?.status || 'waiting',
      response: result.response,
      toolCalls: result.toolCalls,
      roundCount: updatedSession?.roundCount || 0
    });
  } catch (error) {
    logger.error(`API: Failed to send message: ${error}`);
    res.status(500).json({ error: (error as Error).message });
  }
});

// ============================================================================
// Chat - SSE Streaming
// ============================================================================

/**
 * GET /api/sessions/:id/messages/stream - SSE endpoint for streaming
 *
 * Query params:
 * - content: The message to send (URL encoded)
 *
 * Or use POST with body if content is long
 */
router.get('/sessions/:id/messages/stream', async (req: Request, res: Response) => {
  const { id } = req.params;
  const content = req.query.content as string;

  if (!content) {
    res.status(400).json({ error: 'content query parameter is required' });
    return;
  }

  await handleSSEStream(id, content, req, res);
});

/**
 * POST /api/sessions/:id/messages/stream - SSE endpoint for streaming (POST variant)
 */
router.post('/sessions/:id/messages/stream', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { content } = req.body;

  if (!content) {
    res.status(400).json({ error: 'content is required' });
    return;
  }

  await handleSSEStream(id, content, req, res);
});

/**
 * Handle SSE streaming for both GET and POST
 */
async function handleSSEStream(sessionId: string, content: string, req: Request, res: Response): Promise<void> {
  try {
    const session = await sessionManager.loadSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');  // Disable nginx buffering

    // Send initial event
    sendSSE(res, 'connected', { sessionId, status: 'connected' });

    // Add user message
    sessionManager.addUserMessage(sessionId, content);

    // Handle client disconnect
    let aborted = false;
    req.on('close', () => {
      aborted = true;
      getOrchestrator().interrupt(sessionId);
    });

    // Run orchestrator with SSE callback
    await runOrchestratorSSE(sessionId, res, () => aborted);

    // Send done event
    const updatedSession = sessionManager.getSession(sessionId);
    sendSSE(res, 'done', {
      sessionId,
      status: updatedSession?.status || 'waiting',
      roundCount: updatedSession?.roundCount || 0
    });

    res.end();
  } catch (error) {
    logger.error(`API: SSE stream error: ${error}`);
    if (!res.headersSent) {
      res.status(500).json({ error: (error as Error).message });
    } else {
      sendSSE(res, 'error', { message: (error as Error).message });
      res.end();
    }
  }
}

/**
 * Send SSE event
 */
function sendSSE(res: Response, event: string, data: any): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ============================================================================
// Orchestrator Helpers
// ============================================================================

interface SyncResult {
  response: string;
  toolCalls: Array<{ tool: string; input: any; output: any; success: boolean }>;
}

/**
 * Run orchestrator synchronously and collect all messages
 */
async function runOrchestratorSync(sessionId: string): Promise<SyncResult> {
  const result: SyncResult = {
    response: '',
    toolCalls: []
  };

  const messages: ServerMessage[] = [];

  // Create a virtual client ID for HTTP
  const clientId = `http-${Date.now()}`;

  // Run with message collector
  await getOrchestrator().runWithCallback(sessionId, clientId, (msg: ServerMessage) => {
    messages.push(msg);

    if (msg.type === 'instructor_message' || msg.type === 'worker_message') {
      result.response += msg.content + '\n';
    }

    if (msg.type === 'tool_use') {
      result.toolCalls.push({
        tool: msg.tool,
        input: msg.input,
        output: null,
        success: false
      });
    }

    if (msg.type === 'tool_result') {
      // Find matching tool call and update
      const lastCall = result.toolCalls[result.toolCalls.length - 1];
      if (lastCall && lastCall.tool === msg.tool) {
        lastCall.output = msg.output;
        lastCall.success = msg.success;
      }
    }
  });

  result.response = result.response.trim();
  return result;
}

/**
 * Run orchestrator with SSE streaming
 */
async function runOrchestratorSSE(
  sessionId: string,
  res: Response,
  isAborted: () => boolean
): Promise<void> {
  const clientId = `sse-${Date.now()}`;

  await getOrchestrator().runWithCallback(sessionId, clientId, (msg: ServerMessage) => {
    if (isAborted()) return;

    // Map ServerMessage types to SSE events
    switch (msg.type) {
      case 'status_update':
        sendSSE(res, 'status', { status: msg.status, round: msg.round });
        break;

      case 'thinking':
        sendSSE(res, 'thinking', { content: msg.content });
        break;

      case 'instructor_message':
        sendSSE(res, 'instructor_message', { content: msg.content });
        break;

      case 'worker_message':
        sendSSE(res, 'worker_message', { content: msg.content });
        break;

      case 'tool_use':
        sendSSE(res, 'tool_use', { tool: msg.tool, input: msg.input });
        break;

      case 'tool_result':
        sendSSE(res, 'tool_result', { tool: msg.tool, output: msg.output, success: msg.success });
        break;

      case 'round_complete':
        sendSSE(res, 'round_complete', { round: msg.roundNumber });
        break;

      case 'waiting_input':
        sendSSE(res, 'waiting_input', { prompt: msg.prompt });
        break;

      case 'system_message':
        sendSSE(res, 'system_message', { content: msg.content, level: msg.level });
        break;

      case 'error':
        sendSSE(res, 'error', { message: msg.message });
        break;
    }
  });
}

export { router as apiRouter };
