/**
 * Tool executor - dispatches tool calls to appropriate implementations
 */

import { readFile, writeFile, editFile, globFiles, grepSearch } from './file-tools.js';
import { executeBashCommand } from './bash-tools.js';
import { gitStatus, gitCommit } from './git-tools.js';
import { ToolCall, ToolResult, ToolExecutionResult, PermissionLevel } from '../types.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { isWorkerCoordinationTool } from './definitions.js';

export class ToolExecutor {
  private permissions: Map<string, PermissionLevel> = new Map();

  constructor() {
    this.initializePermissions();
  }

  /**
   * Initialize tool permissions from config
   */
  private initializePermissions(): void {
    // Set default permissions
    const defaults: Record<string, PermissionLevel> = {
      read_file: PermissionLevel.ALWAYS_ALLOWED,
      write_file: PermissionLevel.ALWAYS_ALLOWED,
      edit_file: PermissionLevel.ALWAYS_ALLOWED,
      glob: PermissionLevel.ALWAYS_ALLOWED,
      grep: PermissionLevel.ALWAYS_ALLOWED,
      bash_command: PermissionLevel.ASK_USER,
      git_status: PermissionLevel.ALWAYS_ALLOWED,
      git_diff: PermissionLevel.ALWAYS_ALLOWED,
      git_commit: PermissionLevel.ASK_USER,
      git_push: PermissionLevel.DENIED
    };

    // Apply config overrides
    for (const tool of config.allowedTools) {
      defaults[tool] = PermissionLevel.ALWAYS_ALLOWED;
    }
    for (const tool of config.askUserTools) {
      defaults[tool] = PermissionLevel.ASK_USER;
    }
    for (const tool of config.deniedTools) {
      defaults[tool] = PermissionLevel.DENIED;
    }

    // Store in map
    for (const [tool, level] of Object.entries(defaults)) {
      this.permissions.set(tool, level);
    }
  }

  /**
   * Check if a tool is allowed
   */
  checkPermission(toolName: string): { allowed: boolean; needsConfirmation: boolean; reason?: string } {
    const level = this.permissions.get(toolName);

    if (level === undefined) {
      // Unknown tool - default to ask user
      return { allowed: true, needsConfirmation: true, reason: 'Unknown tool' };
    }

    switch (level) {
      case PermissionLevel.ALWAYS_ALLOWED:
        return { allowed: true, needsConfirmation: false };
      case PermissionLevel.ASK_USER:
        return { allowed: true, needsConfirmation: true };
      case PermissionLevel.DENIED:
        return { allowed: false, needsConfirmation: false, reason: 'Tool is disabled by policy' };
      default:
        return { allowed: true, needsConfirmation: true };
    }
  }

  /**
   * Execute a tool call
   */
  async execute(toolCall: ToolCall): Promise<ToolResult> {
    const { id, name, input } = toolCall;

    logger.debug(`Executing tool: ${name}`, input);

    // Check if this is a worker coordination tool (handled separately)
    if (isWorkerCoordinationTool(name)) {
      return {
        tool_use_id: id,
        content: JSON.stringify({
          type: 'worker_coordination',
          tool: name,
          input
        })
      };
    }

    // Check permission
    const permission = this.checkPermission(name);
    if (!permission.allowed) {
      return {
        tool_use_id: id,
        content: `Tool "${name}" is not allowed: ${permission.reason}`,
        is_error: true
      };
    }

    // Execute the tool
    let result: ToolExecutionResult;

    try {
      switch (name) {
        case 'read_file':
          result = await readFile(input);
          break;

        case 'write_file':
          result = await writeFile(input);
          break;

        case 'edit_file':
          result = await editFile(input);
          break;

        case 'glob':
          result = await globFiles(input);
          break;

        case 'grep':
          result = await grepSearch(input);
          break;

        case 'bash_command':
          result = await executeBashCommand(input);
          break;

        case 'git_status':
          result = await gitStatus(input);
          break;

        case 'git_commit':
          result = await gitCommit(input);
          break;

        default:
          result = {
            success: false,
            error: `Unknown tool: ${name}`
          };
      }
    } catch (error) {
      logger.error(`Tool execution error for ${name}:`, error);
      result = {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }

    // Format result
    if (result.success) {
      return {
        tool_use_id: id,
        content: typeof result.output === 'string'
          ? result.output
          : JSON.stringify(result.output, null, 2)
      };
    } else {
      return {
        tool_use_id: id,
        content: result.error || 'Tool execution failed',
        is_error: true
      };
    }
  }

  /**
   * Execute multiple tool calls in sequence
   */
  async executeAll(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    for (const toolCall of toolCalls) {
      const result = await this.execute(toolCall);
      results.push(result);
    }

    return results;
  }

  /**
   * Grant permission to a tool
   */
  grantPermission(toolName: string): void {
    this.permissions.set(toolName, PermissionLevel.ALWAYS_ALLOWED);
    logger.info(`Granted permission for tool: ${toolName}`);
  }

  /**
   * Revoke permission from a tool
   */
  revokePermission(toolName: string): void {
    this.permissions.set(toolName, PermissionLevel.DENIED);
    logger.info(`Revoked permission for tool: ${toolName}`);
  }

  /**
   * Get current permission level for a tool
   */
  getPermission(toolName: string): PermissionLevel | undefined {
    return this.permissions.get(toolName);
  }
}

// Export singleton instance
export const toolExecutor = new ToolExecutor();
