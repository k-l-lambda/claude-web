/**
 * JSONL file storage for session persistence
 */

import { promises as fs } from 'fs';
import { existsSync, mkdirSync, appendFileSync } from 'fs';
import { dirname, join } from 'path';
import { SessionEventType } from './types.js';
import { logger } from '../utils/logger.js';

export class SessionStorage {
  private storageDir: string;

  constructor(storageDir: string) {
    this.storageDir = storageDir;
    this.ensureStorageDir();
  }

  /**
   * Ensure storage directory exists
   */
  private ensureStorageDir(): void {
    if (!existsSync(this.storageDir)) {
      mkdirSync(this.storageDir, { recursive: true });
      logger.info(`Created session storage directory: ${this.storageDir}`);
    }
  }

  /**
   * Get file path for a session
   */
  private getFilePath(sessionId: string): string {
    return join(this.storageDir, `session-${sessionId}.jsonl`);
  }

  /**
   * Append an event to a session's JSONL file
   */
  appendEvent(sessionId: string, event: SessionEventType): void {
    const filePath = this.getFilePath(sessionId);
    const line = JSON.stringify(event) + '\n';

    try {
      appendFileSync(filePath, line, 'utf8');
    } catch (error) {
      logger.error(`Failed to append event to session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Load all events for a session
   */
  async loadEvents(sessionId: string): Promise<SessionEventType[]> {
    const filePath = this.getFilePath(sessionId);

    if (!existsSync(filePath)) {
      return [];
    }

    try {
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());

      return lines.map((line, index) => {
        try {
          return JSON.parse(line);
        } catch (parseError) {
          logger.warn(`Failed to parse line ${index + 1} in session ${sessionId}`);
          return null;
        }
      }).filter(Boolean) as SessionEventType[];
    } catch (error) {
      logger.error(`Failed to load session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Check if a session file exists
   */
  sessionExists(sessionId: string): boolean {
    return existsSync(this.getFilePath(sessionId));
  }

  /**
   * Delete a session file
   */
  async deleteSession(sessionId: string): Promise<void> {
    const filePath = this.getFilePath(sessionId);

    if (existsSync(filePath)) {
      await fs.unlink(filePath);
      logger.info(`Deleted session file: ${sessionId}`);
    }
  }

  /**
   * List all session files
   */
  async listSessions(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.storageDir);
      return files
        .filter(file => file.startsWith('session-') && file.endsWith('.jsonl'))
        .map(file => file.replace('session-', '').replace('.jsonl', ''));
    } catch (error) {
      logger.error('Failed to list sessions:', error);
      return [];
    }
  }

  /**
   * Get file stats for a session
   */
  async getSessionStats(sessionId: string): Promise<{ size: number; mtime: Date } | null> {
    const filePath = this.getFilePath(sessionId);

    if (!existsSync(filePath)) {
      return null;
    }

    try {
      const stats = await fs.stat(filePath);
      return {
        size: stats.size,
        mtime: stats.mtime
      };
    } catch (error) {
      return null;
    }
  }
}
