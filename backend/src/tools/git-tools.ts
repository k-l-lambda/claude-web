/**
 * Git operation tools
 */

import { executeBashSync, executeBashCommand } from './bash-tools.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { GitInput, ToolExecutionResult } from '../types.js';

// Read-only git commands that are always safe
const READ_ONLY_COMMANDS = [
  'status',
  'log',
  'diff',
  'show',
  'branch',
  'remote',
  'tag',
  'describe',
  'rev-parse',
  'ls-files',
  'ls-tree',
  'blame',
  'shortlog',
  'config --list',
  'stash list'
];

// Write commands that require confirmation
const WRITE_COMMANDS = [
  'add',
  'commit',
  'reset',
  'checkout',
  'merge',
  'rebase',
  'cherry-pick',
  'stash',
  'clean'
];

// Forbidden commands (too dangerous)
const FORBIDDEN_COMMANDS = [
  'push',
  'push --force',
  'push -f',
  'reset --hard',
  'clean -fd',
  'filter-branch'
];

/**
 * Check if a git command is read-only
 */
function isReadOnlyGitCommand(command: string): boolean {
  const cmd = command.trim().toLowerCase();
  return READ_ONLY_COMMANDS.some(ro => cmd.startsWith(ro));
}

/**
 * Check if a git command is forbidden
 */
function isForbiddenGitCommand(command: string): boolean {
  const cmd = command.trim().toLowerCase();
  return FORBIDDEN_COMMANDS.some(f => cmd.includes(f));
}

/**
 * Execute a read-only git command
 */
export async function gitStatus(input: GitInput): Promise<ToolExecutionResult> {
  const { command } = input;

  // Validate command is read-only
  if (!isReadOnlyGitCommand(command)) {
    return {
      success: false,
      error: `git_status only supports read-only commands. Use git_commit for write operations. Allowed: ${READ_ONLY_COMMANDS.join(', ')}`
    };
  }

  try {
    const result = executeBashSync(`git ${command}`);

    return {
      success: result.exitCode === 0,
      output: {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode
      },
      error: result.exitCode !== 0 ? result.stderr : undefined
    };
  } catch (error) {
    logger.error(`Git command failed: git ${command}`, error);
    return {
      success: false,
      error: `Git command failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Execute a git commit
 */
export async function gitCommit(input: { message: string; files?: string[] }): Promise<ToolExecutionResult> {
  const { message, files } = input;

  try {
    // Stage files if specified
    if (files && files.length > 0) {
      const addResult = executeBashSync(`git add ${files.map(f => `"${f}"`).join(' ')}`);
      if (addResult.exitCode !== 0) {
        return {
          success: false,
          error: `Failed to stage files: ${addResult.stderr}`
        };
      }
    }

    // Create commit
    const commitMessage = message.replace(/"/g, '\\"');
    const commitResult = executeBashSync(`git commit -m "${commitMessage}"`);

    if (commitResult.exitCode !== 0) {
      return {
        success: false,
        error: `Commit failed: ${commitResult.stderr || commitResult.stdout}`
      };
    }

    return {
      success: true,
      output: {
        message: 'Commit created successfully',
        stdout: commitResult.stdout
      }
    };
  } catch (error) {
    logger.error('Git commit failed:', error);
    return {
      success: false,
      error: `Git commit failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Get current git status summary
 */
export function getGitStatusSummary(): {
  branch: string;
  modified: number;
  staged: number;
  untracked: number;
} {
  try {
    const branchResult = executeBashSync('git branch --show-current');
    const statusResult = executeBashSync('git status --porcelain');

    const lines = statusResult.stdout.split('\n').filter(Boolean);
    let modified = 0;
    let staged = 0;
    let untracked = 0;

    for (const line of lines) {
      const index = line[0];
      const worktree = line[1];

      if (index === '?' && worktree === '?') {
        untracked++;
      } else if (index !== ' ' && index !== '?') {
        staged++;
      }
      if (worktree !== ' ' && worktree !== '?') {
        modified++;
      }
    }

    return {
      branch: branchResult.stdout.trim(),
      modified,
      staged,
      untracked
    };
  } catch {
    return {
      branch: 'unknown',
      modified: 0,
      staged: 0,
      untracked: 0
    };
  }
}
