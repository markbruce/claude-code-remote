import React, { useState, useMemo, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import oneLight from 'react-syntax-highlighter/dist/esm/styles/prism/one-light';
import type { ChatMessage } from '../../stores/chatStore';
import {
  BashResult,
  FileReadResult,
  FileEditResult,
  FileWriteResult,
  GlobResult,
  GrepResult,
  WebSearchResult,
  WebFetchResult,
  TodoResult,
  TaskResult,
  UnknownResult,
} from './tool-results';

interface MessageComponentProps {
  message: ChatMessage;
  prevMessage?: ChatMessage | null;
}

/* ------------------------------------------------------------------ */
/*  Claude Logo SVG (matches Anthropic branding)                       */
/* ------------------------------------------------------------------ */
const ClaudeLogo: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none">
    <path
      d="M16.98 9.01L12.48 20.5h-2.92l1.67-4.27L7.27 4.5h3.02l2.55 8.16h.06L15.06 4.5h2.92L14.7 12.6l2.28 6.9h-2.92l-.09-.27L16.98 9.01z"
      fill="currentColor"
    />
  </svg>
);

/* ------------------------------------------------------------------ */
/*  Markdown renderer                                                  */
/* ------------------------------------------------------------------ */
const MarkdownContent: React.FC<{ content: string }> = memo(({ content }) => {
  const { t } = useTranslation();
  const components = useMemo(
    () => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      code({ inline, className, children, ...props }: any) {
        const match = /language-(\w+)/.exec(className || '');
        const raw = String(children).replace(/\n$/, '');
        const looksMultiline = /[\r\n]/.test(raw);
        const shouldInline = inline || !looksMultiline;

        if (shouldInline) {
          return (
            <code className="rounded bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 text-[13px] text-gray-800 dark:text-gray-200" {...props}>
              {children}
            </code>
          );
        }

        const lang = match ? match[1] : 'text';
        return (
          <div className="group relative my-3 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <div className="flex items-center justify-between bg-gray-100 dark:bg-gray-700 px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400">
              <span>{lang}</span>
              <button
                onClick={() => navigator.clipboard.writeText(raw)}
                className="rounded px-1.5 py-0.5 text-gray-500 dark:text-gray-400 opacity-0 transition-all hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-gray-800 dark:hover:text-gray-200 group-hover:opacity-100"
              >
                {t('common.copy')}
              </button>
            </div>
            <SyntaxHighlighter
              style={oneLight}
              language={lang}
              PreTag="div"
              customStyle={{ margin: 0, borderRadius: 0, fontSize: '13px', background: '#fafafa' }}
              {...props}
            >
              {raw}
            </SyntaxHighlighter>
          </div>
        );
      },
      p({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
        return <p className="mb-2 leading-relaxed last:mb-0" {...props}>{children}</p>;
      },
      ul({ children, ...props }: React.HTMLAttributes<HTMLUListElement>) {
        return <ul className="mb-2 list-disc space-y-1 pl-5" {...props}>{children}</ul>;
      },
      ol({ children, ...props }: React.HTMLAttributes<HTMLOListElement>) {
        return <ol className="mb-2 list-decimal space-y-1 pl-5" {...props}>{children}</ol>;
      },
      blockquote({ children, ...props }: React.HTMLAttributes<HTMLQuoteElement>) {
        return (
          <blockquote className="mb-2 border-l-2 border-gray-300 dark:border-gray-600 pl-3 italic text-gray-600 dark:text-gray-400" {...props}>
            {children}
          </blockquote>
        );
      },
      a({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
        return (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline" {...props}>
            {children}
          </a>
        );
      },
      table({ children, ...props }: React.HTMLAttributes<HTMLTableElement>) {
        return (
          <div className="my-2 overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
            <table className="min-w-full text-sm" {...props}>{children}</table>
          </div>
        );
      },
      th({ children, ...props }: React.HTMLAttributes<HTMLTableCellElement>) {
        return <th className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 text-left text-xs font-medium text-gray-600 dark:text-gray-400" {...props}>{children}</th>;
      },
      td({ children, ...props }: React.HTMLAttributes<HTMLTableCellElement>) {
        return <td className="border-b border-gray-100 dark:border-gray-800 px-3 py-1.5 text-gray-700 dark:text-gray-300" {...props}>{children}</td>;
      },
    }),
    [t],
  );

  return (
    <div className="prose-sm max-w-none text-[14px] leading-6 text-gray-800 dark:text-gray-200">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
});
MarkdownContent.displayName = 'MarkdownContent';

/* ------------------------------------------------------------------ */
/*  User message — right-aligned bubble                                */
/* ------------------------------------------------------------------ */
const UserMessage: React.FC<{ content: string; timestamp: Date }> = ({ content, timestamp }) => {
  const time = useMemo(() => new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), [timestamp]);

  return (
    <div className="flex flex-row-reverse items-start gap-2.5">
      {/* Avatar */}
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-medium text-white">
        U
      </div>
      {/* Bubble */}
      <div className="group flex max-w-[75%] flex-col items-end">
        <div className="rounded-2xl rounded-tr-md bg-blue-600 px-4 py-2.5 text-[14px] leading-6 text-white whitespace-pre-wrap">
          {content}
        </div>
        <span className="mr-1 mt-1 text-[11px] text-gray-600 dark:text-gray-400 opacity-0 transition-opacity group-hover:opacity-100">
          {time}
        </span>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Assistant message — left-aligned with Claude logo                  */
/* ------------------------------------------------------------------ */
const AssistantMessage: React.FC<{
  content: string;
  isStreaming?: boolean;
  timestamp: Date;
  isGrouped: boolean;
}> = ({ content, isStreaming, timestamp, isGrouped }) => {
  const { t } = useTranslation();
  const time = useMemo(() => new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), [timestamp]);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (!content) return;
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [content]);

  return (
    <div className="flex items-start gap-2.5">
      {/* Avatar column — show logo or spacer */}
      {!isGrouped ? (
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-white">
          <ClaudeLogo className="h-4 w-4" />
        </div>
      ) : (
        <div className="w-7 flex-shrink-0" />
      )}

      {/* Content */}
      <div className="group min-w-0 max-w-[85%]">
        {!isGrouped && (
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Claude</span>
          </div>
        )}

        <div className="relative">
          {content ? (
            <MarkdownContent content={content} />
          ) : isStreaming ? (
            <span className="text-sm text-gray-500 dark:text-gray-400">{t('chat.thinking')}</span>
          ) : null}
          {isStreaming && content && (
            <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-orange-400 align-text-bottom" />
          )}
        </div>

        {/* Hover actions */}
        {content && !isStreaming && (
          <div className="mt-1 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300"
            >
              {copied ? (
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              ) : (
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              )}
              {copied ? t('common.copied') : t('common.copy')}
            </button>
            <span className="text-[11px] text-gray-600 dark:text-gray-400">{time}</span>
          </div>
        )}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Tool use — collapsible panel (like Claude Code UI)                 */
/* ------------------------------------------------------------------ */
const TOOL_LABELS: Record<string, { icon: string; labelKey: string }> = {
  Read: { icon: '📖', labelKey: 'chat.toolLabels.Read' },
  Edit: { icon: '✏️', labelKey: 'chat.toolLabels.Edit' },
  Write: { icon: '📝', labelKey: 'chat.toolLabels.Write' },
  Bash: { icon: '🖥️', labelKey: 'chat.toolLabels.Bash' },
  Glob: { icon: '🔍', labelKey: 'chat.toolLabels.Glob' },
  Grep: { icon: '🔎', labelKey: 'chat.toolLabels.Grep' },
  WebSearch: { icon: '🌐', labelKey: 'chat.toolLabels.WebSearch' },
  WebFetch: { icon: '🌐', labelKey: 'chat.toolLabels.WebFetch' },
  TodoRead: { icon: '📋', labelKey: 'chat.toolLabels.TodoRead' },
  TodoWrite: { icon: '📋', labelKey: 'chat.toolLabels.TodoWrite' },
  Task: { icon: '🤖', labelKey: 'chat.toolLabels.Task' },
};

/* ------------------------------------------------------------------ */
/*  Tool Result Renderer - selects specialized component              */
/* ------------------------------------------------------------------ */
interface ToolResultRendererProps {
  toolName: string;
  toolInput: string;
  toolResult?: { content: string; isError: boolean } | null;
  isRunning: boolean;
}

const ToolResultRenderer: React.FC<ToolResultRendererProps> = memo(({ toolName, toolInput, toolResult, isRunning }) => {
  // Parse input
  let parsedInput: Record<string, unknown> = {};
  try {
    parsedInput = JSON.parse(toolInput);
  } catch {
    // Keep empty object
  }

  const isError = toolResult?.isError ?? false;
  const resultContent = toolResult?.content ?? '';

  // Render specialized component based on tool type
  switch (toolName) {
    case 'Bash':
      return (
        <BashResult
          command={(parsedInput.command as string) || ''}
          result={resultContent}
          isError={isError}
        />
      );

    case 'Read':
      return (
        <FileReadResult
          filePath={(parsedInput.file_path as string) || ''}
          content={resultContent}
          limit={parsedInput.limit as number | undefined}
          offset={parsedInput.offset as number | undefined}
        />
      );

    case 'Edit':
      return (
        <FileEditResult
          filePath={(parsedInput.file_path as string) || ''}
          oldContent={(parsedInput.old_string as string) || ''}
          newContent={(parsedInput.new_string as string) || ''}
        />
      );

    case 'Write':
      return (
        <FileWriteResult
          filePath={(parsedInput.file_path as string) || ''}
          content={(parsedInput.content as string) || ''}
        />
      );

    case 'Glob':
      // Parse glob result - files are line-separated
      const globFiles = resultContent.split('\n').filter(line => line.trim());
      return (
        <GlobResult
          pattern={(parsedInput.pattern as string) || ''}
          files={globFiles}
          isError={isError}
        />
      );

    case 'Grep':
      // Parse grep matches from result
      const grepMatches = resultContent.split('\n').filter(line => line.trim()).map(line => {
        // Format: filename:line:content
        const match = line.match(/^([^:]+):(\d+):(.*)$/);
        if (match) {
          return {
            filePath: match[1],
            line: parseInt(match[2], 10),
            content: match[3],
            matchedText: (parsedInput.pattern as string) || '',
          };
        }
        return {
          filePath: line,
          line: 0,
          content: line,
          matchedText: (parsedInput.pattern as string) || '',
        };
      });
      return (
        <GrepResult
          pattern={(parsedInput.pattern as string) || ''}
          matches={grepMatches}
          isError={isError}
        />
      );

    case 'WebSearch':
      // Parse web search results - extract from markdown-like format
      const searchResults: Array<{ title: string; url: string; snippet?: string }> = [];
      const searchLines = resultContent.split('\n');
      let currentResult: { title: string; url: string; snippet?: string } | null = null;

      for (const line of searchLines) {
        const titleMatch = line.match(/\[([^\]]+)\]\(([^)]+)\)/);
        if (titleMatch) {
          if (currentResult) searchResults.push(currentResult);
          currentResult = { title: titleMatch[1], url: titleMatch[2] };
        } else if (currentResult && line.trim() && !line.startsWith('Sources:') && !line.startsWith('-')) {
          currentResult.snippet = (currentResult.snippet || '') + ' ' + line.trim();
        }
      }
      if (currentResult) searchResults.push(currentResult);

      return (
        <WebSearchResult
          query={(parsedInput.query as string) || ''}
          results={searchResults}
          isError={isError}
        />
      );

    case 'WebFetch':
      return (
        <WebFetchResult
          url={(parsedInput.url as string) || ''}
          content={resultContent}
          isError={isError}
        />
      );

    case 'TodoRead':
    case 'TodoWrite':
      // Parse todo items from result
      let todos: Array<{ id: string; content: string; status: 'pending' | 'in_progress' | 'completed'; priority?: 'high' | 'medium' | 'low' }> = [];
      try {
        // Try to parse as JSON array
        const parsed = JSON.parse(resultContent);
        if (Array.isArray(parsed)) {
          todos = parsed.map((item, idx) => ({
            id: item.id || String(idx),
            content: item.content || item.subject || String(item),
            status: item.status || 'pending',
            priority: item.priority,
          }));
        }
      } catch {
        // Parse as text lines
        todos = resultContent.split('\n').filter(line => line.trim()).map((line, idx) => ({
          id: String(idx),
          content: line.replace(/^\[.\]\s*/, '').replace(/^\d+\.\s*/, ''),
          status: line.includes('[x]') || line.includes('[X]') ? 'completed' :
                  line.includes('[>]') || line.includes('进行') ? 'in_progress' : 'pending',
        }));
      }
      return (
        <TodoResult
          todos={todos}
          mode={toolName === 'TodoRead' ? 'read' : 'write'}
          isError={isError}
        />
      );

    case 'Task':
      return (
        <TaskResult
          taskName={(parsedInput.name as string) || (parsedInput.description as string) || 'Task'}
          taskType={(parsedInput.subagent_type as string) || 'general-purpose'}
          status={isRunning ? 'running' : isError ? 'failed' : 'completed'}
          result={resultContent}
          output={resultContent}
          isError={isError}
        />
      );

    default:
      return (
        <UnknownResult
          toolName={toolName}
          toolInput={toolInput}
          toolResult={{ content: resultContent, isError }}
          isError={isError}
        />
      );
  }
});
ToolResultRenderer.displayName = 'ToolResultRenderer';

/* ------------------------------------------------------------------ */
/*  Tool use — collapsible panel with specialized renderers            */
/* ------------------------------------------------------------------ */
const ToolUseMessage: React.FC<{ message: ChatMessage; isGrouped: boolean }> = ({ message, isGrouped }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const toolMeta = TOOL_LABELS[message.toolName || ''] || { icon: '🔧', labelKey: '' };
  const hasResult = !!message.toolResult;
  const isRunning = !hasResult;
  const isError = hasResult && message.toolResult!.isError;

  let displayText = '';
  if (message.toolInput) {
    try {
      const parsed = JSON.parse(message.toolInput);
      if (parsed.file_path || parsed.path) {
        displayText = parsed.file_path || parsed.path;
      } else if (parsed.command) {
        displayText = parsed.command;
      } else if (parsed.pattern) {
        displayText = parsed.pattern;
      } else if (parsed.query || parsed.search_term) {
        displayText = parsed.query || parsed.search_term;
      } else if (parsed.url) {
        displayText = parsed.url;
      } else if (parsed.name || parsed.description) {
        displayText = parsed.name || parsed.description;
      }
    } catch {
      displayText = message.toolInput.slice(0, 80);
    }
  }

  // Parse input for display
  let parsedInputForDisplay: string | null = null;
  if (message.toolInput) {
    try {
      parsedInputForDisplay = JSON.stringify(JSON.parse(message.toolInput), null, 2);
    } catch {
      parsedInputForDisplay = message.toolInput;
    }
  }

  return (
    <div className="flex items-start gap-2.5">
      {!isGrouped ? (
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-white">
          <ClaudeLogo className="h-4 w-4" />
        </div>
      ) : (
        <div className="w-7 flex-shrink-0" />
      )}

      <div className="min-w-0 flex-1 max-w-[85%]">
        {/* Header button - always visible */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-left transition-colors hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          {/* Status indicator */}
          {isRunning ? (
            <svg className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : isError ? (
            <span className="h-2 w-2 flex-shrink-0 rounded-full bg-red-500" />
          ) : (
            <span className="h-2 w-2 flex-shrink-0 rounded-full bg-green-500" />
          )}

          {/* Tool icon + name */}
          <span className="text-sm">{toolMeta.icon}</span>
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{toolMeta.labelKey ? t(toolMeta.labelKey) : (message.toolName || t('chat.tools'))}</span>

          {/* Summary */}
          {displayText && (
            <span className="truncate text-xs text-gray-500 dark:text-gray-400 font-mono">{displayText}</span>
          )}

          {/* Expand chevron */}
          <svg
            className={`ml-auto h-3.5 w-3.5 flex-shrink-0 text-gray-500 dark:text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Expanded content with specialized renderer */}
        {expanded && (
          <div className="mt-1.5">
            {hasResult ? (
              <ToolResultRenderer
                toolName={message.toolName || ''}
                toolInput={message.toolInput || '{}'}
                toolResult={message.toolResult}
                isRunning={isRunning}
              />
            ) : (
              <div className="space-y-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3">
                {/* Running indicator */}
                <div className="flex items-center gap-2 text-blue-500 text-sm">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>{t('chat.executing')}</span>
                </div>

                {/* Show input parameters when running */}
                {parsedInputForDisplay && (
                  <details open>
                    <summary className="cursor-pointer select-none text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                      {t('chat.inputParams')}
                    </summary>
                    <pre className="mt-1.5 max-h-48 overflow-auto rounded bg-gray-100 dark:bg-gray-700 p-2.5 text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
                      {parsedInputForDisplay}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Error message                                                      */
/* ------------------------------------------------------------------ */
const ErrorMessage: React.FC<{ content: string }> = ({ content }) => (
  <div className="flex items-start gap-2.5">
    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white">
      !
    </div>
    <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-2.5 text-sm text-red-700 dark:text-red-400">
      {content}
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/*  Root component                                                     */
/* ------------------------------------------------------------------ */
export const MessageComponent: React.FC<MessageComponentProps> = memo(({ message, prevMessage }) => {
  const isGrouped = !!prevMessage &&
    prevMessage.type === message.type &&
    (message.type === 'assistant' || message.type === 'tool_use');

  switch (message.type) {
    case 'user':
      return <UserMessage content={message.content} timestamp={message.timestamp} />;
    case 'assistant':
      return (
        <AssistantMessage
          content={message.content}
          isStreaming={message.isStreaming}
          timestamp={message.timestamp}
          isGrouped={isGrouped}
        />
      );
    case 'tool_use':
      return <ToolUseMessage message={message} isGrouped={isGrouped} />;
    case 'tool_result':
      return null;
    case 'error':
      return <ErrorMessage content={message.content} />;
    default:
      return null;
  }
});
MessageComponent.displayName = 'MessageComponent';
