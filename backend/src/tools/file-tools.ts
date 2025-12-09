/**
 * File operation tools implementation
 */

import { promises as fs } from 'fs';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { glob } from 'glob';
import { config } from '../config.js';
import { validatePath } from '../utils/path-validator.js';
import { logger } from '../utils/logger.js';
import {
  ReadFileInput,
  WriteFileInput,
  EditFileInput,
  GlobInput,
  GrepInput,
  ToolExecutionResult
} from '../types.js';

/**
 * Read file contents with optional offset and limit
 */
export async function readFile(input: ReadFileInput): Promise<ToolExecutionResult> {
  const validation = validatePath(input.path);
  if (!validation.valid) {
    return { success: false, error: validation.reason };
  }

  const filePath = validation.path!;

  if (!existsSync(filePath)) {
    return { success: false, error: `File not found: ${input.path}` };
  }

  try {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n');

    // Apply offset and limit
    const offset = input.offset ? input.offset - 1 : 0; // Convert to 0-based
    const limit = input.limit || lines.length;
    const selectedLines = lines.slice(offset, offset + limit);

    // Format with line numbers
    const output = selectedLines
      .map((line, idx) => `${String(offset + idx + 1).padStart(6, ' ')}│${line}`)
      .join('\n');

    return {
      success: true,
      output: {
        content: output,
        totalLines: lines.length,
        displayedLines: selectedLines.length,
        startLine: offset + 1,
        endLine: offset + selectedLines.length
      }
    };
  } catch (error) {
    logger.error(`Failed to read file ${input.path}:`, error);
    return {
      success: false,
      error: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Write content to a file
 */
export async function writeFile(input: WriteFileInput): Promise<ToolExecutionResult> {
  const validation = validatePath(input.path);
  if (!validation.valid) {
    return { success: false, error: validation.reason };
  }

  const filePath = validation.path!;

  try {
    // Ensure directory exists
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    await fs.writeFile(filePath, input.content, 'utf8');

    const lines = input.content.split('\n').length;
    return {
      success: true,
      output: {
        message: `Successfully wrote ${lines} lines to ${input.path}`,
        path: input.path,
        size: Buffer.byteLength(input.content, 'utf8')
      }
    };
  } catch (error) {
    logger.error(`Failed to write file ${input.path}:`, error);
    return {
      success: false,
      error: `Failed to write file: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Edit a file by replacing text
 */
export async function editFile(input: EditFileInput): Promise<ToolExecutionResult> {
  const validation = validatePath(input.path);
  if (!validation.valid) {
    return { success: false, error: validation.reason };
  }

  const filePath = validation.path!;

  if (!existsSync(filePath)) {
    return { success: false, error: `File not found: ${input.path}` };
  }

  try {
    const content = await fs.readFile(filePath, 'utf8');

    // Check if old_string exists
    if (!content.includes(input.old_string)) {
      return {
        success: false,
        error: `Could not find the specified text to replace in ${input.path}. Make sure the old_string matches exactly.`
      };
    }

    // Count occurrences
    const occurrences = content.split(input.old_string).length - 1;
    if (occurrences > 1) {
      return {
        success: false,
        error: `Found ${occurrences} occurrences of the text. Please provide more context to make the match unique.`
      };
    }

    // Perform replacement
    const newContent = content.replace(input.old_string, input.new_string);
    await fs.writeFile(filePath, newContent, 'utf8');

    return {
      success: true,
      output: {
        message: `Successfully edited ${input.path}`,
        path: input.path,
        linesRemoved: input.old_string.split('\n').length,
        linesAdded: input.new_string.split('\n').length
      }
    };
  } catch (error) {
    logger.error(`Failed to edit file ${input.path}:`, error);
    return {
      success: false,
      error: `Failed to edit file: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Find files matching a glob pattern
 */
export async function globFiles(input: GlobInput): Promise<ToolExecutionResult> {
  const searchPath = input.path || '.';
  const validation = validatePath(searchPath);

  // For glob, we allow searching within workDir
  const basePath = validation.valid ? validation.path! : config.workDir;

  try {
    const pattern = join(basePath, input.pattern);
    const matches = await glob(pattern, {
      cwd: config.workDir,
      nodir: true,
      dot: false // Don't match hidden files
    });

    // Convert to relative paths
    const relativePaths = matches.map(match =>
      match.startsWith(config.workDir)
        ? match.slice(config.workDir.length + 1)
        : match
    );

    return {
      success: true,
      output: {
        pattern: input.pattern,
        matches: relativePaths,
        count: relativePaths.length
      }
    };
  } catch (error) {
    logger.error(`Glob failed for pattern ${input.pattern}:`, error);
    return {
      success: false,
      error: `Glob failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Search for a pattern in files
 */
export async function grepSearch(input: GrepInput): Promise<ToolExecutionResult> {
  const searchPath = input.path || '.';
  const validation = validatePath(searchPath);
  const basePath = validation.valid ? validation.path! : config.workDir;

  try {
    const regex = new RegExp(input.pattern, 'g');
    const outputMode = input.output_mode || 'files_with_matches';

    // Find files to search
    let files: string[];
    if (input.glob) {
      const pattern = join(basePath, input.glob);
      files = await glob(pattern, { nodir: true });
    } else {
      // Search all files in path (limit to common code files)
      const defaultPattern = join(basePath, '**/*.{ts,js,tsx,jsx,json,md,txt,py,java,go,rs}');
      files = await glob(defaultPattern, { nodir: true });
    }

    const results: { file: string; matches: { line: number; content: string }[] }[] = [];
    let totalMatches = 0;

    for (const file of files.slice(0, 100)) { // Limit to 100 files
      try {
        const content = await fs.readFile(file, 'utf8');
        const lines = content.split('\n');
        const fileMatches: { line: number; content: string }[] = [];

        lines.forEach((line, idx) => {
          if (regex.test(line)) {
            fileMatches.push({ line: idx + 1, content: line.trim() });
            totalMatches++;
            regex.lastIndex = 0; // Reset regex
          }
        });

        if (fileMatches.length > 0) {
          const relativePath = file.startsWith(config.workDir)
            ? file.slice(config.workDir.length + 1)
            : file;
          results.push({ file: relativePath, matches: fileMatches });
        }
      } catch {
        // Skip unreadable files
      }
    }

    if (outputMode === 'files_with_matches') {
      return {
        success: true,
        output: {
          pattern: input.pattern,
          files: results.map(r => r.file),
          count: results.length
        }
      };
    } else if (outputMode === 'count') {
      return {
        success: true,
        output: {
          pattern: input.pattern,
          totalMatches,
          filesMatched: results.length
        }
      };
    } else {
      // content mode
      return {
        success: true,
        output: {
          pattern: input.pattern,
          results: results.slice(0, 20), // Limit output
          totalMatches,
          filesMatched: results.length
        }
      };
    }
  } catch (error) {
    logger.error(`Grep failed for pattern ${input.pattern}:`, error);
    return {
      success: false,
      error: `Grep failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
