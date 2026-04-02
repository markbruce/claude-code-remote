import React, { useMemo } from 'react';

interface DiffViewerProps {
  oldContent: string;
  newContent: string;
  filename?: string;
  maxHeight?: string;
}

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

function computeDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const result: DiffLine[] = [];
  let oldIdx = 0;
  let newIdx = 0;
  let oldLineNum = 1;
  let newLineNum = 1;

  // Simple LCS-based diff
  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    if (oldIdx >= oldLines.length) {
      result.push({ type: 'added', content: newLines[newIdx], newLineNum: newLineNum++ });
      newIdx++;
    } else if (newIdx >= newLines.length) {
      result.push({ type: 'removed', content: oldLines[oldIdx], oldLineNum: oldLineNum++ });
      oldIdx++;
    } else if (oldLines[oldIdx] === newLines[newIdx]) {
      result.push({ type: 'unchanged', content: oldLines[oldIdx], oldLineNum: oldLineNum++, newLineNum: newLineNum++ });
      oldIdx++;
      newIdx++;
    } else {
      // Check if line was added or removed
      const oldLineInNew = newLines.slice(newIdx).indexOf(oldLines[oldIdx]);
      const newLineInOld = oldLines.slice(oldIdx).indexOf(newLines[newIdx]);

      if (oldLineInNew === -1 || (newLineInOld !== -1 && newLineInOld < oldLineInNew)) {
        result.push({ type: 'removed', content: oldLines[oldIdx], oldLineNum: oldLineNum++ });
        oldIdx++;
      } else {
        result.push({ type: 'added', content: newLines[newIdx], newLineNum: newLineNum++ });
        newIdx++;
      }
    }
  }

  return result;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
  oldContent,
  newContent,
  filename,
  maxHeight = '400px',
}) => {
  const diff = useMemo(() => {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    return computeDiff(oldLines, newLines);
  }, [oldContent, newContent]);

  const addedCount = diff.filter(l => l.type === 'added').length;
  const removedCount = diff.filter(l => l.type === 'removed').length;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      {filename && (
        <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700 font-mono">{filename}</span>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-green-600">+{addedCount}</span>
            <span className="text-red-600">-{removedCount}</span>
          </div>
        </div>
      )}

      {/* Diff Content */}
      <div className="overflow-auto font-mono text-xs" style={{ maxHeight }}>
        <table className="w-full">
          <tbody>
            {diff.map((line, idx) => (
              <tr
                key={idx}
                className={
                  line.type === 'added' ? 'bg-green-50' :
                  line.type === 'removed' ? 'bg-red-50' : ''
                }
              >
                {/* Old Line Number */}
                <td className="w-10 px-2 py-0.5 text-right text-gray-400 select-none border-r border-gray-100">
                  {line.type !== 'added' && <span>{line.oldLineNum}</span>}
                </td>
                {/* New Line Number */}
                <td className="w-10 px-2 py-0.5 text-right text-gray-400 select-none border-r border-gray-100">
                  {line.type !== 'removed' && <span>{line.newLineNum}</span>}
                </td>

                {/* Diff Indicator */}
                <td className={`w-6 px-2 py-0.5 text-center select-none ${
                  line.type === 'added' ? 'text-green-600' :
                  line.type === 'removed' ? 'text-red-600' : 'text-gray-300'
                }`}>
                  {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                </td>

                {/* Content */}
                <td className={`px-2 py-0.5 whitespace-pre ${
                  line.type === 'added' ? 'text-green-800' :
                  line.type === 'removed' ? 'text-red-800' : 'text-gray-700'
                }`}>
                  {line.content || ' '}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
