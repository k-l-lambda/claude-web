/**
 * Path validation utility for file system safety
 */

import { resolve, relative, normalize } from 'path';
import { config } from '../config.js';

export interface ValidationResult {
  valid: boolean;
  path?: string;
  reason?: string;
}

/**
 * Validate that a file path is safe and within the working directory
 */
export function validatePath(inputPath: string): ValidationResult {
  try {
    // Resolve to absolute path
    const absolute = resolve(config.workDir, inputPath);
    const normalized = normalize(absolute);

    // Check if within working directory
    const relativePath = relative(config.workDir, normalized);
    if (relativePath.startsWith('..') || normalize(relativePath).startsWith('..')) {
      return {
        valid: false,
        reason: 'Path traversal detected: path is outside working directory'
      };
    }

    // Block access to sensitive files
    const sensitivePatterns = [
      /\/\.env$/,
      /\/\.env\./,
      /\/\.git\/config$/,
      /\/\.ssh\//,
      /\/id_rsa$/,
      /\/\.aws\//,
      /\/\.anthropic\//,
      /password/i
    ];

    if (sensitivePatterns.some(pattern => pattern.test(normalized))) {
      return {
        valid: false,
        reason: 'Access to sensitive file denied'
      };
    }

    return {
      valid: true,
      path: normalized
    };
  } catch (error) {
    return {
      valid: false,
      reason: `Invalid path: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Check if a bash command is dangerous
 */
export function isDangerousCommand(command: string): boolean {
  const dangerous = [
    /rm\s+-rf\s+\/$/,                    // rm -rf /
    /rm\s+-rf\s+\~$/,                    // rm -rf ~
    /dd\s+.*of=\/dev\//,                 // dd to device
    /:\(\)\{.*\};\s*:/,                  // fork bomb
    /curl.*\|\s*sh/,                     // curl | sh
    /wget.*\|\s*sh/,                     // wget | sh
    /mkfs\./,                            // format filesystem
    /shutdown/,                          // system shutdown
    /reboot/,                            // system reboot
    /\/dev\/sd[a-z]/,                    // direct disk access
  ];

  return dangerous.some(pattern => pattern.test(command));
}
