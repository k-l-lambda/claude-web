/**
 * Tool definitions for Claude API
 * These schemas define what tools are available for the agents
 */

import { ClaudeToolDefinition } from '../claude/types.js';

/**
 * File operation tools
 */
export const readFileTool: ClaudeToolDefinition = {
  name: 'read_file',
  description: 'Read the contents of a file. Returns the file content with line numbers.',
  input_schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The path to the file to read (relative to working directory)'
      },
      offset: {
        type: 'number',
        description: 'Optional: Start reading from this line number (1-based)'
      },
      limit: {
        type: 'number',
        description: 'Optional: Maximum number of lines to read'
      }
    },
    required: ['path']
  }
};

export const writeFileTool: ClaudeToolDefinition = {
  name: 'write_file',
  description: 'Write content to a file. Creates the file if it does not exist, overwrites if it does.',
  input_schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The path to the file to write (relative to working directory)'
      },
      content: {
        type: 'string',
        description: 'The content to write to the file'
      }
    },
    required: ['path', 'content']
  }
};

export const editFileTool: ClaudeToolDefinition = {
  name: 'edit_file',
  description: 'Edit a file by replacing a specific string with new content. The old_string must exist exactly in the file.',
  input_schema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The path to the file to edit (relative to working directory)'
      },
      old_string: {
        type: 'string',
        description: 'The exact string to find and replace'
      },
      new_string: {
        type: 'string',
        description: 'The string to replace old_string with'
      }
    },
    required: ['path', 'old_string', 'new_string']
  }
};

export const globTool: ClaudeToolDefinition = {
  name: 'glob',
  description: 'Find files matching a glob pattern. Returns list of matching file paths.',
  input_schema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Glob pattern to match (e.g., "**/*.ts", "src/**/*.js")'
      },
      path: {
        type: 'string',
        description: 'Optional: Directory to search in (relative to working directory)'
      }
    },
    required: ['pattern']
  }
};

export const grepTool: ClaudeToolDefinition = {
  name: 'grep',
  description: 'Search for a pattern in files. Uses regular expressions.',
  input_schema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Regular expression pattern to search for'
      },
      path: {
        type: 'string',
        description: 'Optional: File or directory to search in'
      },
      glob: {
        type: 'string',
        description: 'Optional: Glob pattern to filter files (e.g., "*.ts")'
      },
      output_mode: {
        type: 'string',
        enum: ['content', 'files_with_matches', 'count'],
        description: 'Output mode: "content" shows matches, "files_with_matches" shows file paths, "count" shows match counts'
      }
    },
    required: ['pattern']
  }
};

/**
 * Bash command tool
 */
export const bashCommandTool: ClaudeToolDefinition = {
  name: 'bash_command',
  description: 'Execute a bash command. Use for running build tools, tests, git commands, etc. Some dangerous commands are blocked.',
  input_schema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The bash command to execute'
      },
      timeout: {
        type: 'number',
        description: 'Optional: Timeout in seconds (default: 30)'
      }
    },
    required: ['command']
  }
};

/**
 * Git tools
 */
export const gitStatusTool: ClaudeToolDefinition = {
  name: 'git_status',
  description: 'Execute read-only git commands like status, log, diff, show, branch, etc.',
  input_schema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'Git command (e.g., "status", "log --oneline -10", "diff HEAD~1")'
      }
    },
    required: ['command']
  }
};

export const gitCommitTool: ClaudeToolDefinition = {
  name: 'git_commit',
  description: 'Create a git commit. Requires confirmation.',
  input_schema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'Commit message'
      },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional: Specific files to commit (default: all staged files)'
      }
    },
    required: ['message']
  }
};

/**
 * Worker coordination tools (Instructor only)
 */
export const callWorkerTool: ClaudeToolDefinition = {
  name: 'call_worker',
  description: 'Start a new conversation with Worker. Resets Worker context with a new system prompt and instruction.',
  input_schema: {
    type: 'object',
    properties: {
      system_prompt: {
        type: 'string',
        description: 'System prompt to set Worker\'s context and role'
      },
      instruction: {
        type: 'string',
        description: 'The task or instruction for Worker to execute'
      },
      model: {
        type: 'string',
        enum: ['haiku', 'sonnet', 'opus'],
        description: 'Optional: Model for Worker (default: sonnet)'
      }
    },
    required: ['system_prompt', 'instruction']
  }
};

export const tellWorkerTool: ClaudeToolDefinition = {
  name: 'tell_worker',
  description: 'Continue an existing conversation with Worker. Worker retains previous context.',
  input_schema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'Message or follow-up instruction for Worker'
      },
      model: {
        type: 'string',
        enum: ['haiku', 'sonnet', 'opus'],
        description: 'Optional: Model for this message'
      }
    },
    required: ['message']
  }
};

/**
 * Tool collections
 */

// Tools available to Worker
export const workerTools: ClaudeToolDefinition[] = [
  readFileTool,
  writeFileTool,
  editFileTool,
  globTool,
  grepTool,
  bashCommandTool,
  gitStatusTool
];

// Tools available to Instructor (includes Worker coordination)
export const instructorTools: ClaudeToolDefinition[] = [
  readFileTool,
  writeFileTool,
  editFileTool,
  globTool,
  grepTool,
  bashCommandTool,
  gitStatusTool,
  gitCommitTool,
  callWorkerTool,
  tellWorkerTool
];

// All tool definitions
export const allTools: ClaudeToolDefinition[] = [
  readFileTool,
  writeFileTool,
  editFileTool,
  globTool,
  grepTool,
  bashCommandTool,
  gitStatusTool,
  gitCommitTool,
  callWorkerTool,
  tellWorkerTool
];

/**
 * Get tool definition by name
 */
export function getToolByName(name: string): ClaudeToolDefinition | undefined {
  return allTools.find(tool => tool.name === name);
}

/**
 * Check if a tool is a worker coordination tool
 */
export function isWorkerCoordinationTool(toolName: string): boolean {
  return ['call_worker', 'tell_worker'].includes(toolName);
}
