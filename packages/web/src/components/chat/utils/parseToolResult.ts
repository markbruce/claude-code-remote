/**
 * Tool result parsing utilities
 * Converts raw tool results into structured data for rendering
 */

 type ToolType =
  | 'Bash'
  | 'Read'
  | 'Edit'
  | 'Write'
  | 'Glob'
  | 'Grep'
  | 'WebSearch'
  | 'WebFetch'
  | 'TodoRead'
  | 'TodoWrite'
  | 'Task'
  | 'Unknown';

export type ParsedToolResult = {
  toolName: ToolType;
  input: Record<string, unknown>;
  result: string;
  isError: boolean;
}

// ============= Input Parsing =============

export interface ParsedToolInput {
  filePath?: string;
  path?: string;
  command?: string;
  pattern?: string;
  query?: string;
  oldContent?: string;
  newContent?: string;
  content?: string;
  raw: Record<string, unknown>;
}

export function parseToolInput(toolName: string, inputStr: string): ParsedToolInput {
  const raw: Record<string, unknown> = {};
  try {
    Object.assign(raw, JSON.parse(inputStr));
  } catch {
    return { raw };
  }
  return {
    filePath: raw.file_path as string | undefined,
    path: raw.path as string | undefined,
    command: raw.command as string | undefined,
    pattern: raw.pattern as string | undefined,
    query: (raw.query || raw.search_term) as string | undefined,
    oldContent: raw.old_string as string | undefined,
    newContent: raw.new_string as string | undefined,
    content: raw.content as string | undefined,
    raw,
  };
}

// ============= Bash Result Parsing =============

export interface ParsedBashResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  command: string;
}

export function parseBashResult(inputStr: string, resultStr: string): ParsedBashResult {
  const input = parseToolInput('Bash', inputStr);
  let stdout = resultStr;
  let stderr = '';
  let exitCode: number | null = null;

  // Try to parse structured output
  try {
    const parsed = JSON.parse(resultStr);
    if (typeof parsed === 'object' && parsed !== null) {
      stdout = parsed.stdout || resultStr;
      stderr = parsed.stderr || '';
      exitCode = typeof parsed.exit_code === 'number' ? parsed.exit_code : null;
    }
  } catch {
    stdout = resultStr;
    stderr = '';
  }

  return { stdout, stderr, exitCode, command: input.command || '' };
}

