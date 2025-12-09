/**
 * Configuration loader from environment variables
 */

import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { Config } from './types.js';

// Load .env file first
loadEnv();

// Load .env.local to override values (if exists)
const envLocalPath = resolve(process.cwd(), '.env.local');
if (existsSync(envLocalPath)) {
  loadEnv({ path: envLocalPath, override: true });
}

/**
 * Load configuration from environment variables
 */
export function loadConfig(): Config {
  const authPassword = process.env.AUTH_PASSWORD || '';
  // Debug: log password length (not the actual password)
  console.log(`[CONFIG] AUTH_PASSWORD loaded, length: ${authPassword.length}`);

  // Determine backend type
  const backendType = (process.env.BACKEND_TYPE || 'sdk') as 'sdk' | 'cli-pipe';
  console.log(`[CONFIG] Backend type: ${backendType}`);

  return {
    port: parseInt(process.env.PORT || '3000', 10),
    authPassword,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    claudeModel: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929',
    enableThinking: process.env.ENABLE_THINKING === 'true',
    workDir: resolve(process.env.WORK_DIR || process.cwd()),
    sessionStorageDir: process.env.SESSION_STORAGE_DIR || '.claude-web/sessions',
    sessionTimeoutMinutes: parseInt(process.env.SESSION_TIMEOUT_MINUTES || '60', 10),
    allowedTools: parseList(process.env.ALLOWED_TOOLS) || [
      'read_file',
      'write_file',
      'edit_file',
      'glob',
      'grep',
      'bash_command',
      'git_status',
      'git_diff'
    ],
    askUserTools: parseList(process.env.ASK_USER_TOOLS) || ['bash_command', 'git_commit'],
    deniedTools: parseList(process.env.DENIED_TOOLS) || ['git_push'],
    bashTimeoutSeconds: parseInt(process.env.BASH_TIMEOUT_SECONDS || '30', 10),
    bashMaxOutputSize: parseInt(process.env.BASH_MAX_OUTPUT_SIZE || '1048576', 10),
    logLevel: (process.env.LOG_LEVEL as any) || 'info',
    logDir: process.env.LOG_DIR || '.claude-web/logs',
    backendType,
    claudePath: process.env.CLAUDE_PATH || 'claude'
  };
}

/**
 * Parse comma-separated list from environment variable
 */
function parseList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  return value.split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Validate configuration
 */
export function validateConfig(config: Config): void {
  const errors: string[] = [];

  if (!config.authPassword) {
    errors.push('AUTH_PASSWORD is required');
  }

  if (!config.anthropicApiKey) {
    errors.push('ANTHROPIC_API_KEY is required');
  }

  if (config.port < 1 || config.port > 65535) {
    errors.push('PORT must be between 1 and 65535');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

// Export singleton config
export const config = loadConfig();
