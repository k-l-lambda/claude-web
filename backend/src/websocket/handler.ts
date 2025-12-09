/**
 * WebSocket message handler
 */

import { WebSocket } from 'ws';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { clientManager, WSClient } from './client-manager.js';
import { sessionManager } from '../session/manager.js';
import { orchestrator } from '../orchestrator/index.js';
import type { ClientMessage, ServerMessage, SessionInfo } from '../types.js';

type MessageHandler = (client: WSClient, message: any) => Promise<void>;

class WebSocketHandler {
  private handlers: Map<string, MessageHandler> = new Map();

  constructor() {
    this.registerHandlers();
  }

  private registerHandlers(): void {
    this.handlers.set('auth', this.handleAuth.bind(this));
    this.handlers.set('create_session', this.handleCreateSession.bind(this));
    this.handlers.set('resume_session', this.handleResumeSession.bind(this));
    this.handlers.set('send_input', this.handleSendInput.bind(this));
    this.handlers.set('interrupt', this.handleInterrupt.bind(this));
    this.handlers.set('list_sessions', this.handleListSessions.bind(this));
    this.handlers.set('get_session', this.handleGetSession.bind(this));
    this.handlers.set('end_session', this.handleEndSession.bind(this));
    this.handlers.set('ping', this.handlePing.bind(this));
  }

  async handleConnection(ws: WebSocket): Promise<void> {
    const client = clientManager.addClient(ws);
    logger.info(`Client connected: ${client.id}`);

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString()) as ClientMessage;
        await this.handleMessage(client, message);
      } catch (error) {
        logger.error(`Failed to handle message: ${error}`);
        this.sendToClient(client, {
          type: 'error',
          message: 'Invalid message format'
        });
      }
    });

    ws.on('close', (code, reason) => {
      logger.info(`Client disconnected: ${client.id} (code: ${code})`);
      clientManager.removeClient(client.id);
    });

    ws.on('error', (error) => {
      logger.error(`WebSocket error for ${client.id}: ${error.message}`);
    });
  }

  private async handleMessage(client: WSClient, message: ClientMessage): Promise<void> {
    const { type } = message;

    // Auth required for most messages
    if (type !== 'auth' && type !== 'ping' && !client.authenticated) {
      this.sendToClient(client, {
        type: 'error',
        message: 'Authentication required'
      });
      return;
    }

    const handler = this.handlers.get(type);
    if (handler) {
      await handler(client, message);
    } else {
      logger.warn(`Unknown message type: ${type}`);
      this.sendToClient(client, {
        type: 'error',
        message: `Unknown message type: ${type}`
      });
    }
  }

  private async handleAuth(client: WSClient, message: { type: 'auth'; password: string }): Promise<void> {
    const { password } = message;

    // Debug logging
    logger.info(`Auth attempt - received password length: ${password?.length}, expected length: ${config.authPassword?.length}`);

    if (password === config.authPassword) {
      const userId = `user-${Date.now()}`;
      clientManager.setAuthenticated(client.id, userId);
      logger.info(`Client authenticated: ${client.id}`);

      this.sendToClient(client, {
        type: 'auth_success',
        userId
      });
    } else {
      logger.warn(`Auth failed for client: ${client.id}`);
      this.sendToClient(client, {
        type: 'auth_failed',
        reason: 'Invalid password'
      });
    }
  }

  private async handleCreateSession(client: WSClient, message: { type: 'create_session'; workDir: string; instruction?: string }): Promise<void> {
    const { workDir, instruction } = message;

    try {
      const session = sessionManager.createSession(workDir, config.claudeModel);
      clientManager.setCurrentSession(client.id, session.sessionId);

      this.sendToClient(client, {
        type: 'session_created',
        sessionId: session.sessionId,
        status: session.status
      });

      logger.info(`Session created: ${session.sessionId} for client ${client.id}`);

      // If initial instruction provided, start processing
      if (instruction) {
        await this.processUserInput(client, session.sessionId, instruction);
      }
    } catch (error) {
      logger.error(`Failed to create session: ${error}`);
      this.sendToClient(client, {
        type: 'error',
        message: `Failed to create session: ${(error as Error).message}`
      });
    }
  }

  private async handleResumeSession(client: WSClient, message: { type: 'resume_session'; sessionId: string }): Promise<void> {
    const { sessionId } = message;

    try {
      const session = await sessionManager.loadSession(sessionId);
      if (!session) {
        this.sendToClient(client, {
          type: 'error',
          message: 'Session not found'
        });
        return;
      }

      clientManager.setCurrentSession(client.id, sessionId);

      this.sendToClient(client, {
        type: 'session_resumed',
        sessionId,
        history: session.instructorHistory
      });

      logger.info(`Session resumed: ${sessionId} for client ${client.id}`);
    } catch (error) {
      logger.error(`Failed to resume session: ${error}`);
      this.sendToClient(client, {
        type: 'error',
        message: `Failed to resume session: ${(error as Error).message}`
      });
    }
  }

  private async handleSendInput(client: WSClient, message: { type: 'send_input'; sessionId: string; content: string }): Promise<void> {
    const { sessionId, content } = message;

    if (client.currentSessionId !== sessionId) {
      this.sendToClient(client, {
        type: 'error',
        message: 'Not connected to this session'
      });
      return;
    }

    await this.processUserInput(client, sessionId, content);
  }

  private async processUserInput(client: WSClient, sessionId: string, content: string): Promise<void> {
    try {
      // Add user message to session
      sessionManager.addUserMessage(sessionId, content);

      // Update status
      this.sendToClient(client, {
        type: 'status_update',
        sessionId,
        status: 'active',
        round: sessionManager.getSession(sessionId)?.roundCount || 0,
        model: config.claudeModel
      });

      // Run orchestrator
      await orchestrator.run(sessionId, client.id);

    } catch (error) {
      logger.error(`Failed to process input: ${error}`);
      this.sendToClient(client, {
        type: 'error',
        message: `Failed to process input: ${(error as Error).message}`
      });
    }
  }

  private async handleInterrupt(client: WSClient, message: { type: 'interrupt'; sessionId: string }): Promise<void> {
    const { sessionId } = message;

    try {
      orchestrator.interrupt(sessionId);
      logger.info(`Interrupt requested for session: ${sessionId}`);

      this.sendToClient(client, {
        type: 'system_message',
        content: 'Interrupt signal sent',
        level: 'info',
        timestamp: Date.now()
      });
    } catch (error) {
      this.sendToClient(client, {
        type: 'error',
        message: `Failed to interrupt: ${(error as Error).message}`
      });
    }
  }

  private async handleListSessions(client: WSClient, message: { type: 'list_sessions' }): Promise<void> {
    try {
      const sessions = await sessionManager.listSessions();
      this.sendToClient(client, {
        type: 'session_list',
        sessions
      });
    } catch (error) {
      this.sendToClient(client, {
        type: 'error',
        message: `Failed to list sessions: ${(error as Error).message}`
      });
    }
  }

  private async handleGetSession(client: WSClient, message: { type: 'get_session'; sessionId: string }): Promise<void> {
    const { sessionId } = message;

    try {
      const session = await sessionManager.loadSession(sessionId);
      if (!session) {
        this.sendToClient(client, {
          type: 'error',
          message: 'Session not found'
        });
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

      this.sendToClient(client, {
        type: 'session_info',
        session: info
      });
    } catch (error) {
      this.sendToClient(client, {
        type: 'error',
        message: `Failed to get session: ${(error as Error).message}`
      });
    }
  }

  private async handleEndSession(client: WSClient, message: { type: 'end_session'; sessionId: string }): Promise<void> {
    const { sessionId } = message;

    try {
      sessionManager.endSession(sessionId, 'User requested');
      clientManager.setCurrentSession(client.id, null);

      // Notify all clients watching this session
      clientManager.sendToSession(sessionId, {
        type: 'session_ended',
        sessionId,
        reason: 'User requested'
      });

      logger.info(`Session ended: ${sessionId}`);
    } catch (error) {
      this.sendToClient(client, {
        type: 'error',
        message: `Failed to end session: ${(error as Error).message}`
      });
    }
  }

  private async handlePing(client: WSClient, message: { type: 'ping' }): Promise<void> {
    this.sendToClient(client, { type: 'pong' });
  }

  private sendToClient(client: WSClient, message: ServerMessage): void {
    clientManager.sendToClient(client.id, message);
  }

  // Public methods for orchestrator to send updates
  sendToSession(sessionId: string, message: ServerMessage): void {
    clientManager.sendToSession(sessionId, message);
  }
}

export const wsHandler = new WebSocketHandler();
