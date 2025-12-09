/**
 * Express server with WebSocket support for Claude Code Web
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import path from 'path';
import { config, validateConfig } from './config.js';
import { logger } from './utils/logger.js';
import { wsHandler } from './websocket/handler.js';

// Validate configuration on startup
try {
  validateConfig(config);
  logger.info('Configuration validated successfully');
} catch (error) {
  logger.error('Configuration validation failed:', error);
  process.exit(1);
}

// Create Express app
const app = express();
const server = createServer(app);

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from frontend dist
const frontendPath = path.join(process.cwd(), '../frontend/dist');
app.use(express.static(frontendPath));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// SPA fallback - serve index.html for all non-API routes
// Express 5 uses {*splat} instead of * for wildcards
app.get('/{*splat}', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// WebSocket server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  logger.info(`WebSocket client connected from ${clientIp}`);

  // Hand off to WebSocket handler
  wsHandler.handleConnection(ws);
});

// Start server
server.listen(config.port, () => {
  logger.info(`Server started on port ${config.port}`);
  logger.info(`Working directory: ${config.workDir}`);
  logger.info(`API endpoint: http://localhost:${config.port}/api`);
  logger.info(`WebSocket endpoint: ws://localhost:${config.port}`);
  logger.info(`Frontend: http://localhost:${config.port}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});
