/**
 * Session Manager - handles session lifecycle and state management
 */

import { v4 as uuidv4 } from 'uuid';
import { SessionStorage } from './storage.js';
import { SessionEventType } from './types.js';
import { SessionState, SessionInfo, SessionStatus, MessageBlock } from '../types.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

export class SessionManager {
  private storage: SessionStorage;
  private activeSessions: Map<string, SessionState> = new Map();
  private sessionLocks: Map<string, boolean> = new Map();

  constructor() {
    this.storage = new SessionStorage(config.sessionStorageDir);
  }

  /**
   * Generate a new session ID
   */
  generateSessionId(): string {
    return uuidv4().split('-')[0]; // Short ID like "abc12345"
  }

  /**
   * Create a new session
   */
  createSession(workDir: string, model?: string): SessionState {
    const sessionId = this.generateSessionId();
    const now = Date.now();

    const session: SessionState = {
      sessionId,
      workDir,
      status: 'initializing',
      createdAt: now,
      lastActivity: now,
      roundCount: 0,
      model: model || config.claudeModel,
      instructorHistory: []
    };

    // Store in memory
    this.activeSessions.set(sessionId, session);

    // Persist session created event
    this.storage.appendEvent(sessionId, {
      type: 'session_created',
      timestamp: now,
      sessionId,
      workDir,
      model: session.model
    });

    logger.info(`Created session ${sessionId} for workDir: ${workDir}`);
    return session;
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): SessionState | undefined {
    return this.activeSessions.get(sessionId);
  }

  /**
   * Check if session exists (in memory or storage)
   */
  async sessionExists(sessionId: string): Promise<boolean> {
    if (this.activeSessions.has(sessionId)) {
      return true;
    }
    return this.storage.sessionExists(sessionId);
  }

  /**
   * Load session from storage
   */
  async loadSession(sessionId: string): Promise<SessionState | null> {
    // Check if already loaded
    if (this.activeSessions.has(sessionId)) {
      return this.activeSessions.get(sessionId)!;
    }

    // Load from storage
    const events = await this.storage.loadEvents(sessionId);
    if (events.length === 0) {
      return null;
    }

    // Reconstruct session state from events
    const session = this.reconstructSession(sessionId, events);
    if (session) {
      this.activeSessions.set(sessionId, session);
    }

    return session;
  }

  /**
   * Reconstruct session state from event log
   */
  private reconstructSession(sessionId: string, events: SessionEventType[]): SessionState | null {
    let session: SessionState | null = null;

    for (const event of events) {
      switch (event.type) {
        case 'session_created':
          session = {
            sessionId,
            workDir: event.workDir,
            status: 'waiting',
            createdAt: event.timestamp,
            lastActivity: event.timestamp,
            roundCount: 0,
            model: event.model || config.claudeModel,
            instructorHistory: []
          };
          break;

        case 'user_message':
          if (session) {
            session.instructorHistory.push({
              role: 'user',
              content: event.content,
              timestamp: event.timestamp
            });
            session.lastActivity = event.timestamp;
          }
          break;

        case 'instructor_message':
          if (session) {
            session.instructorHistory.push({
              role: 'assistant',
              content: event.content,
              timestamp: event.timestamp
            });
            session.lastActivity = event.timestamp;
          }
          break;

        case 'round_complete':
          if (session) {
            session.roundCount = event.round;
            session.lastActivity = event.timestamp;
          }
          break;

        case 'status_change':
          if (session) {
            session.status = event.status as SessionStatus;
            session.lastActivity = event.timestamp;
          }
          break;

        case 'session_ended':
          if (session) {
            session.status = 'ended';
            session.lastActivity = event.timestamp;
          }
          break;
      }
    }

    return session;
  }

  /**
   * Update session status
   */
  updateStatus(sessionId: string, status: SessionStatus): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.status = status;
      session.lastActivity = Date.now();

      this.storage.appendEvent(sessionId, {
        type: 'status_change',
        timestamp: session.lastActivity,
        status
      });
    }
  }

  /**
   * Add user message to session
   */
  addUserMessage(sessionId: string, content: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      const timestamp = Date.now();
      session.instructorHistory.push({
        role: 'user',
        content,
        timestamp
      });
      session.lastActivity = timestamp;

      this.storage.appendEvent(sessionId, {
        type: 'user_message',
        timestamp,
        content
      });
    }
  }

  /**
   * Add instructor message to session
   */
  addInstructorMessage(sessionId: string, content: any): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      const timestamp = Date.now();
      session.instructorHistory.push({
        role: 'assistant',
        content,
        timestamp
      });
      session.lastActivity = timestamp;

      this.storage.appendEvent(sessionId, {
        type: 'instructor_message',
        timestamp,
        role: 'assistant',
        content
      });
    }
  }

  /**
   * Record round completion
   */
  completeRound(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.roundCount++;
      session.lastActivity = Date.now();

      this.storage.appendEvent(sessionId, {
        type: 'round_complete',
        timestamp: session.lastActivity,
        round: session.roundCount
      });
    }
  }

  /**
   * Increment round count
   */
  incrementRound(sessionId: string): void {
    this.completeRound(sessionId);
  }

  /**
   * Add tool results to session history
   */
  addToolResults(sessionId: string, results: Array<{ tool_use_id: string; content: string; is_error?: boolean }>): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      const timestamp = Date.now();
      // Store as raw tool results - the content can be any type
      session.instructorHistory.push({
        role: 'user',
        content: results.map(r => ({
          type: 'tool_result' as const,
          tool_use_id: r.tool_use_id,
          content: r.content
        })) as any, // Cast to any to avoid strict type checking
        timestamp
      });
      session.lastActivity = timestamp;

      this.storage.appendEvent(sessionId, {
        type: 'tool_results',
        timestamp,
        results
      });
    }
  }

  /**
   * End a session
   */
  endSession(sessionId: string, reason: string = 'user_exit'): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.status = 'ended';
      session.lastActivity = Date.now();

      this.storage.appendEvent(sessionId, {
        type: 'session_ended',
        timestamp: session.lastActivity,
        reason
      });

      // Remove from active sessions
      this.activeSessions.delete(sessionId);
      this.sessionLocks.delete(sessionId);

      logger.info(`Ended session ${sessionId}: ${reason}`);
    }
  }

  /**
   * List all sessions (active + stored)
   */
  async listSessions(): Promise<SessionInfo[]> {
    const storedSessionIds = await this.storage.listSessions();
    const allSessionIds = new Set([
      ...this.activeSessions.keys(),
      ...storedSessionIds
    ]);

    const sessions: SessionInfo[] = [];

    for (const sessionId of allSessionIds) {
      let session = this.activeSessions.get(sessionId);

      // Load from storage if not in memory
      if (!session) {
        const loaded = await this.loadSession(sessionId);
        if (loaded) {
          session = loaded;
        }
      }

      if (session) {
        sessions.push({
          sessionId: session.sessionId,
          workDir: session.workDir,
          status: session.status,
          createdAt: new Date(session.createdAt).toISOString(),
          lastActivity: new Date(session.lastActivity).toISOString(),
          roundCount: session.roundCount,
          model: session.model
        });
      }
    }

    // Sort by last activity (most recent first)
    return sessions.sort((a, b) =>
      new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
    );
  }

  /**
   * Acquire lock on session (prevent concurrent access)
   */
  acquireLock(sessionId: string): boolean {
    if (this.sessionLocks.get(sessionId)) {
      return false; // Already locked
    }
    this.sessionLocks.set(sessionId, true);
    return true;
  }

  /**
   * Release lock on session
   */
  releaseLock(sessionId: string): void {
    this.sessionLocks.delete(sessionId);
  }

  /**
   * Check if session is locked
   */
  isLocked(sessionId: string): boolean {
    return this.sessionLocks.get(sessionId) === true;
  }

  /**
   * Get instructor history for API calls
   */
  getInstructorHistory(sessionId: string): MessageBlock[] {
    const session = this.activeSessions.get(sessionId);
    return session ? session.instructorHistory : [];
  }

  /**
   * Delete a session permanently
   */
  async deleteSession(sessionId: string): Promise<void> {
    this.activeSessions.delete(sessionId);
    this.sessionLocks.delete(sessionId);
    await this.storage.deleteSession(sessionId);
    logger.info(`Deleted session ${sessionId}`);
  }
}

// Export singleton instance
export const sessionManager = new SessionManager();
