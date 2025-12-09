/**
 * Bash command execution with safety restrictions
 */

import { exec, execSync, ExecException } from 'child_process';
import { promisify } from 'util';
import { config } from '../config.js';
import { isDangerousCommand } from '../utils/path-validator.js';
import { logger } from '../utils/logger.js';
import { BashInput, ToolExecutionResult } from '../types.js';

const execPromise = promisify(exec);

/**
 * Execute a bash command with safety checks
 */
export async function executeBashCommand(input: BashInput): Promise<ToolExecutionResult> {
  const { command, timeout } = input;
  const timeoutMs = (timeout || config.bashTimeoutSeconds) * 1000;

  // Check for dangerous commands
  if (isDangerousCommand(command)) {
    logger.warn(`Blocked dangerous command: ${command}`);
    return {
      success: false,
      error: 'This command has been blocked for safety reasons.'
    };
  }

  try {
    const { stdout, stderr } = await execPromise(command, {
      cwd: config.workDir,
      timeout: timeoutMs,
      maxBuffer: config.bashMaxOutputSize,
      shell: '/bin/bash',
      env: {
        ...process.env,
        PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin'
      }
    });

    // Truncate output if too long
    const maxOutput = 10000;
    let output = stdout;
    let truncated = false;

    if (output.length > maxOutput) {
      output = output.slice(0, maxOutput) + '\n... (output truncated)';
      truncated = true;
    }

    return {
      success: true,
      output: {
        stdout: output,
        stderr: stderr || undefined,
        truncated,
        exitCode: 0
      }
    };
  } catch (error) {
    const execError = error as ExecException & { stdout?: string; stderr?: string };

    // Check if it was a timeout
    if (execError.killed) {
      return {
        success: false,
        error: `Command timed out after ${timeout || config.bashTimeoutSeconds} seconds`,
        output: {
          stdout: execError.stdout || '',
          stderr: execError.stderr || '',
          exitCode: execError.code || -1,
          killed: true
        }
      };
    }

    // Command failed with non-zero exit code
    return {
      success: false,
      error: execError.message,
      output: {
        stdout: execError.stdout || '',
        stderr: execError.stderr || '',
        exitCode: execError.code || 1
      }
    };
  }
}

/**
 * Execute a command synchronously (for simple commands)
 */
export function executeBashSync(command: string): { stdout: string; stderr: string; exitCode: number } {
  if (isDangerousCommand(command)) {
    throw new Error('Dangerous command blocked');
  }

  try {
    const stdout = execSync(command, {
      cwd: config.workDir,
      timeout: config.bashTimeoutSeconds * 1000,
      maxBuffer: config.bashMaxOutputSize,
      encoding: 'utf8',
      shell: '/bin/bash'
    });

    return {
      stdout: stdout.toString(),
      stderr: '',
      exitCode: 0
    };
  } catch (error) {
    const execError = error as ExecException & { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: execError.stdout?.toString() || '',
      stderr: execError.stderr?.toString() || execError.message,
      exitCode: execError.status || 1
    };
  }
}
