import { forwardRef } from 'react';

interface TerminalViewerProps {
  lines: string[];
  showAllLogs: boolean;
  onShowAll: () => void;
  agentLabel: string;
  mode: 'Live' | 'ReadOnly';
  tailCount?: number;
  minHeight?: string;
  colorLine?: (line: string) => string;
  emptyMessage?: string;
  showCursor?: boolean;
}

const defaultColorLine = (line: string): string => {
  if (line.startsWith('[w-bud]')) return 'text-primary';
  if (line.startsWith('ERROR') || line.includes('ERROR')) return 'text-red-400';
  return '';
};

const TerminalViewer = forwardRef<HTMLDivElement, TerminalViewerProps>(
  (
    {
      lines,
      showAllLogs,
      onShowAll,
      agentLabel,
      mode,
      tailCount = 50,
      minHeight = '300px',
      colorLine = defaultColorLine,
      emptyMessage = 'Waiting for output...',
      showCursor = true,
    },
    ref
  ) => {
    const hidden = showAllLogs ? 0 : Math.max(0, lines.length - tailCount);
    const visible = showAllLogs ? lines : lines.slice(-tailCount);
    const offset = showAllLogs ? 0 : hidden;

    return (
      <div className="flex-1 bg-[#0d1117] rounded-xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col font-mono text-sm">
        <div className="h-10 bg-[#161b22] border-b border-slate-800 flex items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
            </div>
            <span className="ml-3 text-xs text-slate-500 font-medium">{agentLabel}</span>
          </div>
          <span className="text-[10px] text-slate-600 uppercase font-bold tracking-wider">{mode}</span>
        </div>
        <div ref={ref} className="flex-1 p-4 overflow-y-auto" style={{ minHeight }}>
          <div className="text-slate-400 space-y-1">
            {hidden > 0 && (
              <button
                onClick={onShowAll}
                className="w-full text-center text-xs text-slate-500 hover:text-primary py-1.5 mb-2 border border-dashed border-slate-700 rounded hover:border-primary/40 transition-colors"
              >
                Show {hidden} earlier line{hidden !== 1 ? 's' : ''}
              </button>
            )}
            {visible.map((line, i) => (
              <div key={offset + i} className="flex">
                <span className="w-8 text-slate-700 select-none text-right mr-3 shrink-0">{offset + i + 1}</span>
                <span className={colorLine(line)}>{line}</span>
              </div>
            ))}
            {lines.length === 0 && (
              <div className="flex">
                <span className="w-8 text-slate-700 select-none text-right mr-3">1</span>
                <span className="animate-pulse text-primary">{emptyMessage}</span>
              </div>
            )}
            {showCursor && (
              <div className="flex">
                <span className="w-8 text-slate-700 select-none text-right mr-3"></span>
                <span className="animate-pulse text-primary">|</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
);

TerminalViewer.displayName = 'TerminalViewer';

export default TerminalViewer;
