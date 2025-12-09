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
import { apiRouter } from './api/routes.js';

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

// Get server config (non-sensitive)
app.get('/api/config', (req, res) => {
  res.json({
    defaultWorkDir: config.workDir,
    model: config.claudeModel
  });
});

// OpenAPI schema endpoint
app.get('/api/docs', (req, res) => {
  res.json({
    openapi: '3.0.0',
    info: {
      title: 'Claude Code Web API',
      version: '1.0.0',
      description: 'REST API for Claude Code Web - AI-assisted software development'
    },
    servers: [
      { url: `http://localhost:${config.port}`, description: 'Local server' }
    ],
    security: [{ apiKey: [] }],
    components: {
      securitySchemes: {
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key for authentication'
        }
      },
      schemas: {
        Session: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', example: 'abc12345' },
            workDir: { type: 'string', example: '/path/to/project' },
            status: { type: 'string', enum: ['initializing', 'active', 'thinking', 'executing', 'waiting', 'paused', 'ended'] },
            createdAt: { type: 'string', format: 'date-time' },
            lastActivity: { type: 'string', format: 'date-time' },
            roundCount: { type: 'integer' },
            model: { type: 'string' }
          }
        },
        MessageResponse: {
          type: 'object',
          properties: {
            sessionId: { type: 'string' },
            status: { type: 'string' },
            response: { type: 'string' },
            toolCalls: { type: 'array', items: { type: 'object' } },
            roundCount: { type: 'integer' }
          }
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    },
    paths: {
      '/api/health': {
        get: {
          summary: 'Health check',
          tags: ['System'],
          security: [],
          responses: {
            '200': { description: 'Server is healthy' }
          }
        }
      },
      '/api/config': {
        get: {
          summary: 'Get server configuration',
          tags: ['System'],
          security: [],
          responses: {
            '200': { description: 'Server configuration' }
          }
        }
      },
      '/api/sessions': {
        get: {
          summary: 'List all sessions',
          tags: ['Sessions'],
          responses: {
            '200': { description: 'List of sessions' },
            '401': { description: 'Unauthorized' }
          }
        },
        post: {
          summary: 'Create new session',
          tags: ['Sessions'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['workDir'],
                  properties: {
                    workDir: { type: 'string', description: 'Working directory path' },
                    model: { type: 'string', description: 'Claude model to use (optional)' },
                    instruction: { type: 'string', description: 'Initial instruction (optional)' }
                  }
                }
              }
            }
          },
          responses: {
            '200': { description: 'Session created' },
            '400': { description: 'Bad request' },
            '401': { description: 'Unauthorized' }
          }
        }
      },
      '/api/sessions/{id}': {
        get: {
          summary: 'Get session details',
          tags: ['Sessions'],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
          ],
          responses: {
            '200': { description: 'Session details with history' },
            '404': { description: 'Session not found' }
          }
        },
        delete: {
          summary: 'End/delete session',
          tags: ['Sessions'],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
          ],
          responses: {
            '200': { description: 'Session ended' },
            '404': { description: 'Session not found' }
          }
        }
      },
      '/api/sessions/{id}/messages': {
        post: {
          summary: 'Send message (synchronous)',
          description: 'Send a message and wait for the complete response',
          tags: ['Chat'],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['content'],
                  properties: {
                    content: { type: 'string', description: 'Message content' }
                  }
                }
              }
            }
          },
          responses: {
            '200': { description: 'Message response' },
            '400': { description: 'Bad request' },
            '404': { description: 'Session not found' }
          }
        }
      },
      '/api/sessions/{id}/messages/stream': {
        get: {
          summary: 'Stream response (SSE)',
          description: 'Send a message and receive streaming response via Server-Sent Events',
          tags: ['Chat'],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'content', in: 'query', required: true, schema: { type: 'string' }, description: 'Message content (URL encoded)' }
          ],
          responses: {
            '200': { description: 'SSE stream', content: { 'text/event-stream': {} } },
            '400': { description: 'Bad request' },
            '404': { description: 'Session not found' }
          }
        },
        post: {
          summary: 'Stream response (SSE via POST)',
          description: 'Send a message via POST body and receive streaming response',
          tags: ['Chat'],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['content'],
                  properties: {
                    content: { type: 'string', description: 'Message content' }
                  }
                }
              }
            }
          },
          responses: {
            '200': { description: 'SSE stream', content: { 'text/event-stream': {} } },
            '400': { description: 'Bad request' },
            '404': { description: 'Session not found' }
          }
        }
      }
    }
  });
});

// Mount API routes (with auth middleware)
app.use('/api', apiRouter);

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
