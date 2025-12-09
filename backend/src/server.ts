/**
 * Express server with WebSocket support for Claude Code Web
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { config, validateConfig } from './config.js';
import { logger } from './utils/logger.js';

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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// WebSocket server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  logger.info(`WebSocket client connected from ${clientIp}`);

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      logger.debug('Received message:', message.type);
      // TODO: Handle messages via WebSocketManager
    } catch (error) {
      logger.error('Failed to parse WebSocket message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format'
      }));
    }
  });

  ws.on('close', () => {
    logger.info(`WebSocket client disconnected from ${clientIp}`);
  });

  ws.on('error', (error) => {
    logger.error('WebSocket error:', error);
  });

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'system_message',
    content: 'Connected to Claude Code Web',
    level: 'info',
    timestamp: Date.now()
  }));
});

// Start server
server.listen(config.port, () => {
  logger.info(`Server started on port ${config.port}`);
  logger.info(`Working directory: ${config.workDir}`);
  logger.info(`WebSocket endpoint: ws://localhost:${config.port}`);
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
