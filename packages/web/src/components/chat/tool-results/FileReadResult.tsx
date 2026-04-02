/**
 * FileReadResult component
 *
 * Styling inspired by claudecodeui (https://github.com/siteboon/claudecodeui)
 * Uses lightweight left-border design with dark mode support
 * Licensed under GPL v3.0
 */
import React, { useState, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import oneLight from 'react-syntax-highlighter/dist/esm/styles/prism/one-light';
import { CopyButton } from '../shared/CopyButton';
import { getFileIcon } from '../utils/fileTypeIcons';

interface FileReadResultProps {
  filePath: string;
  content: string;
  limit?: number;
  offset?: number;
}

const getLanguageFromFile = (filePath: string): string => {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    js: 'javascript',
    jsx: 'jsx',
    ts: 'typescript',
    tsx: 'tsx',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    html: 'html',
    css: 'css',
    scss: 'scss',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
    sh: 'bash',
    sql: 'sql',
  };
  return langMap[ext] || 'text';
};

export const FileReadResult: React.FC<FileReadResultProps> = memo(({ filePath, content, limit, offset }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const { icon, color } = getFileIcon(filePath);
  const lines = content.split('\n');
  const totalLines = lines.length;
  const startLine = offset || 0;
  const displayLines = limit ? lines.slice(startLine, startLine + limit) : lines;
  const isTruncated = limit !== undefined && totalLines > limit;
  const language = getLanguageFromFile(filePath);
  const filename = filePath.split('/').pop() || filePath;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content);
  }, [content]);

  const toggleExpand = useCallback(() => setExpanded(prev => !prev), []);

  return (
    <div className="border-l-2 border-l-gray-300 dark:border-l-gray-600 my-1 py-0.5 pl-3">
      {/* Collapsible header */}
      <details className="group/details relative" open={expanded} onToggle={(e) => setExpanded((e.target as HTMLDetailsElement).open)}>
        <summary className="flex cursor-pointer select-none items-center gap-1.5 py-0.5 text-xs">
          <svg
            className="h-3 w-3 flex-shrink-0 text-gray-400 transition-transform duration-150 group-open/details:rotate-90 dark:text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="flex-shrink-0 font-medium text-gray-500 dark:text-gray-400">Read</span>
          <span className="flex-shrink-0 text-[10px] text-gray-300 dark:text-gray-600">/</span>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCopy(); }}
            className={`text-xs ${color}`}
          >
            {icon}
          </button>
          <span className="flex-1 truncate font-mono text-blue-600 transition-colors hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300" title={filePath}>
            {filename}
          </span>
          <span className="flex-shrink-0 text-[11px] italic text-gray-400 dark:text-gray-500">
            {totalLines} {t('toolResult.line')}
          </span>
          <CopyButton text={content} label={t('common.copy')} className="text-gray-400 hover:text-gray-200 opacity-0 group-hover/details:opacity-100 transition-opacity" />
        </summary>
        <div className="mt-1.5 pl-[18px]">
          <div className={`${expanded ? '' : 'max-h-96'} overflow-auto rounded border border-gray-200/50 dark:border-gray-700/50`}>
            <div className="flex">
              {/* Line numbers */}
              <div className="flex-shrink-0 bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 select-none">
                {displayLines.map((_, idx) => (
                  <div key={idx} className="px-3 py-0.5 text-right text-xs text-gray-400 w-10 font-mono">
                    {startLine + idx + 1}
                  </div>
                ))}
              </div>
              {/* Code content */}
              <SyntaxHighlighter
                language={language}
                style={oneLight}
                PreTag="div"
                customStyle={{
                  margin: 0,
                  padding: '0.5rem',
                  fontSize: '12px',
                  background: 'transparent',
                  flex: 1,
                }}
              >
                {displayLines.join('\n')}
              </SyntaxHighlighter>
            </div>
          </div>
          {/* Truncation notice */}
          {isTruncated && !expanded && (
            <div className="px-3 py-1.5 text-center text-xs text-gray-500">
              <button
                onClick={toggleExpand}
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                {t('toolResult.expandAllLines', { count: totalLines })}
              </button>
            </div>
          )}
        </div>
      </details>
    </div>
  );
});

FileReadResult.displayName = 'FileReadResult';
