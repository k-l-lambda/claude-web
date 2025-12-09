/**
 * API Authentication Middleware
 */

import { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

/**
 * Middleware to validate X-API-Key header
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    logger.warn(`API auth failed: Missing X-API-Key header from ${req.ip}`);
    res.status(401).json({ error: 'Missing X-API-Key header' });
    return;
  }

  if (apiKey !== config.authPassword) {
    logger.warn(`API auth failed: Invalid API key from ${req.ip}`);
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  next();
}
