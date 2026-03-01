import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { Run, AppConfig } from '../types';
import Breadcrumbs from '../components/common/Breadcrumbs';
import TerminalViewer from '../components/common/TerminalViewer';
import StatusBadge from '../components/common/StatusBadge';
import StatCard from '../components/common/StatCard';

export default function ExecutionMonitor() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const [run, setRun] = useState<Run | null>(null);
  const [planEdit, setPlanEdit] = useState('');
  const [editing, setEditing] = useState(false);
  const [wsLines, setWsLines] = useState<string[]>([]);
  const termRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const wsRef = useRef<WebSocket | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [showAllLogs, setShowAllLogs] = useState(false);
  const [fileLines, setFileLines] = useState<string[]>([]);
  const [expandedDiffs, setExpandedDiffs] = useState<Record<string, string>>({});
  const [loadingDiff, setLoadingDiff] = useState<string | null>(null);
  const LOG_TAIL = 50;

  useEffect(() => {
    loadRun();
    pollRef.current = setInterval(loadRun, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [runId]);

  useEffect(() => {
    if (run?.status === 'planning' || run?.status === 'executing') {
      connectWS();
    }
    if (run?.status === 'done' || run?.status === 'failed' || run?.status === 'aborted') {
      if (pollRef.current) clearInterval(pollRef.current);
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      // Fetch logs from file if we don't have live WS lines
      if (wsLines.length === 0 && fileLines.length === 0 && runId) {
        api.getRunLogs(runId).then((res) => setFileLines(res.lines || [])).catch(() => {});
      }
    }
    // Clear terminal lines and reset log expansion when transitioning to executing phase
    if (run?.status === 'executing') {
      setWsLines([]);
      setShowAllLogs(false);
    }
  }, [run?.status]);

  useEffect(() => {
    if (termRef.current) {
      termRef.current.scrollTop = termRef.current.scrollHeight;
    }
  }, [wsLines]);

  async function loadRun() {
    if (!runId) return;
    try {
      if (!config) {
        const cfg = await api.getConfig();
        setConfig(cfg);
      }
      const r = await api.getRun(runId);
      setRun(r);
      if (r.plan_md && !planEdit) {
        setPlanEdit(r.plan_md);
      }
    } catch (e) {
      console.error('Failed to load run:', e);
    }
  }

  function connectWS() {
    if (!runId) return;
    // Prevent duplicate connections
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/runs/${runId}`);
    wsRef.current = ws;
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'output') {
        setWsLines((prev) => [...prev, data.message]);
      }
    };
    ws.onclose = () => { if (wsRef.current === ws) wsRef.current = null; };
    ws.onerror = () => ws.close();
  }

  async function handleApprove() {
    if (!runId) return;
    await api.approveRun(runId, planEdit);
    loadRun();
  }

  async function handleAbort() {
    if (!runId) return;
    await api.abortRun(runId);
    loadRun();
  }

  if (!run) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-secondary">
        <span className="material-symbols-outlined animate-spin text-4xl">progress_activity</span>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Status Header */}
      <div className="bg-panel-dark/90 backdrop-blur-md border-b border-border-dark px-6 py-4 flex flex-col gap-4 z-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Breadcrumbs items={[
              { label: 'Sprint Board', to: '/' },
              { label: (run.story_ids || [run.story_id]).join(', ') },
              { label: run.run_id, to: `/run/${run.run_id}` },
              { label: run.status.replace('_', ' ') },
            ]} />
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
              {run.story_summary || run.story_id}
              <StatusBadge status={run.status} />
            </h1>
          </div>
          <div className="flex gap-3">
            {['planning', 'awaiting_approval', 'executing'].includes(run.status) && (
              <button
                onClick={handleAbort}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white border border-red-600 rounded-lg text-sm font-bold shadow-md shadow-red-500/20 transition-all"
              >
                <span className="material-symbols-outlined text-[18px]">block</span>
                Abort
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Status" value={run.status.replace('_', ' ')} highlight />
          <StatCard label="Repos" value={run.repos.join(', ')} />
          <StatCard label="Changed Files" value={String((run.changed_files || []).length)} />
          <StatCard
            label="Duration"
            value={
              run.duration_seconds
                ? `${Math.floor(run.duration_seconds / 60)}m ${Math.floor(run.duration_seconds % 60)}s`
                : run.started_at
                ? 'Running...'
                : '-'
            }
          />
          {(run.plan_tokens_in > 0 || run.plan_tokens_out > 0) && (
            <StatCard label="Plan Tokens" value={`${fmtTokens(run.plan_tokens_in)} in / ${fmtTokens(run.plan_tokens_out)} out`} />
          )}
          {(run.exec_tokens_in > 0 || run.exec_tokens_out > 0) && (
            <StatCard label="Exec Tokens" value={`${fmtTokens(run.exec_tokens_in)} in / ${fmtTokens(run.exec_tokens_out)} out`} />
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Phase A: Planning */}
        {run.status === 'planning' && (
          <div className="flex-1 flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <span className="material-symbols-outlined text-primary animate-pulse">smart_toy</span>
              <h2 className="text-lg font-bold text-white">Generating Plan...</h2>
              <span className="text-xs text-text-secondary font-mono">{run.repos.join(', ')}</span>
            </div>

            {/* Live terminal during planning */}
            <TerminalViewer
              ref={termRef}
              lines={wsLines}
              showAllLogs={showAllLogs}
              onShowAll={() => setShowAllLogs(true)}
              agentLabel={`${agentLabel(config?.agents?.planning_agent)} — Planning`}
              mode="Live"
              tailCount={LOG_TAIL}
              emptyMessage="Initializing planning agent..."
            />
          </div>
        )}

        {/* Phase A: Awaiting Approval */}
        {run.status === 'awaiting_approval' && (
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">description</span>
                PLAN.md
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditing(!editing)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-300 border border-border-dark rounded hover:bg-surface-hover transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">{editing ? 'visibility' : 'edit'}</span>
                  {editing ? 'Preview' : 'Edit'}
                </button>
              </div>
            </div>

            {editing ? (
              <textarea
                className="w-full h-96 bg-bg-dark border border-border-dark rounded-lg text-sm text-slate-200 p-4 font-mono focus:ring-1 focus:ring-primary focus:border-primary resize-none"
                value={planEdit}
                onChange={(e) => setPlanEdit(e.target.value)}
              />
            ) : (
              <div className="bg-surface-dark border border-border-dark rounded-lg p-6 prose prose-invert prose-sm max-w-none">
                <pre className="whitespace-pre-wrap text-sm text-slate-300 font-mono">{planEdit}</pre>
              </div>
            )}

            <div className="flex gap-3 mt-6 justify-end">
              <button
                onClick={handleAbort}
                className="px-4 py-2 border border-border-dark rounded-lg text-sm font-bold text-slate-300 hover:bg-surface-hover transition-colors"
              >
                Reject
              </button>
              <button
                onClick={handleApprove}
                className="px-6 py-2 bg-primary hover:bg-primary-dark rounded-lg text-white text-sm font-bold shadow-lg shadow-primary/20 flex items-center gap-2 transition-all"
              >
                <span className="material-symbols-outlined text-[18px]">check</span>
                Approve & Execute
              </button>
            </div>
          </div>
        )}

        {/* Phase B: Executing */}
        {run.status === 'executing' && (
          <div className="flex-1 flex flex-col">
            {/* Worktrees */}
            {Object.keys(run.worktrees).length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-bold text-text-secondary uppercase mb-2">Worktrees</h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(run.worktrees).map(([repo, path]) => (
                    <span key={repo} className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded text-xs font-mono">
                      {repo}: {path}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Terminal */}
            <TerminalViewer
              ref={termRef}
              lines={wsLines}
              showAllLogs={showAllLogs}
              onShowAll={() => setShowAllLogs(true)}
              agentLabel={`${agentLabel(config?.agents?.execution_agent)} — Execution`}
              mode="ReadOnly"
              tailCount={LOG_TAIL}
              minHeight="400px"
              colorLine={execColorLine}
              emptyMessage="Connecting to execution stream..."
            />
          </div>
        )}

        {/* Phase C: Done / Failed / Aborted */}
        {['done', 'failed', 'aborted'].includes(run.status) && (
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-8">
              <span className={`material-symbols-outlined text-6xl mb-4 block ${
                run.status === 'done' ? 'text-emerald-400' :
                run.status === 'failed' ? 'text-red-400' :
                'text-amber-400'
              }`}>
                {run.status === 'done' ? 'check_circle' : run.status === 'failed' ? 'cancel' : 'do_not_disturb_on'}
              </span>
              <h2 className="text-xl font-bold text-white capitalize">{run.status}</h2>
              {run.duration_seconds && (
                <p className="text-text-secondary mt-1">
                  Duration: {Math.floor(run.duration_seconds / 60)}m {Math.floor(run.duration_seconds % 60)}s
                </p>
              )}
              {run.error && (
                <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-left">
                  <p className="text-red-400 text-sm font-mono">{run.error}</p>
                </div>
              )}
            </div>

            {/* Changed Files */}
            {(run.changed_files || []).length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-bold text-white uppercase mb-3 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-text-secondary">description</span>
                  Changed Files
                </h3>
                <div className="bg-surface-dark border border-border-dark rounded-lg overflow-hidden">
                  {(run.changed_files || []).map((file) => (
                    <div key={file} className="border-b border-border-dark last:border-b-0">
                      <div
                        className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover transition-colors cursor-pointer"
                        onClick={async () => {
                          if (expandedDiffs[file] !== undefined) {
                            setExpandedDiffs((prev) => { const next = { ...prev }; delete next[file]; return next; });
                            return;
                          }
                          setLoadingDiff(file);
                          try {
                            const res = await api.getRunDiff(run.run_id, file);
                            const diff = res.diffs?.[0]?.diff || '(no diff available)';
                            setExpandedDiffs((prev) => ({ ...prev, [file]: diff }));
                          } catch { setExpandedDiffs((prev) => ({ ...prev, [file]: '(failed to load diff)' })); }
                          setLoadingDiff(null);
                        }}
                      >
                        <span className="text-sm font-mono text-slate-300">{file}</span>
                        <span className={`text-xs ${loadingDiff === file ? 'text-primary animate-pulse' : 'text-text-secondary hover:text-primary'} transition-colors`}>
                          {loadingDiff === file ? 'Loading...' : expandedDiffs[file] !== undefined ? 'Hide Diff' : 'View Diff'}
                        </span>
                      </div>
                      {expandedDiffs[file] !== undefined && (
                        <div className="px-4 pb-3">
                          <pre className="bg-bg-dark rounded-md p-3 text-xs font-mono overflow-x-auto max-h-[500px] overflow-y-auto whitespace-pre">
                            {expandedDiffs[file].split('\n').map((line, i) => {
                              let color = 'text-slate-400';
                              if (line.startsWith('+') && !line.startsWith('+++')) color = 'text-green-400';
                              else if (line.startsWith('-') && !line.startsWith('---')) color = 'text-red-400';
                              else if (line.startsWith('@@')) color = 'text-cyan-400';
                              return <div key={i} className={color}>{line}</div>;
                            })}
                          </pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Logs — use wsLines if captured live, else fetch from log file */}
            {(() => {
              const allLines = wsLines.length > 0 ? wsLines : fileLines;
              if (allLines.length === 0) return null;
              const hidden = showAllLogs ? 0 : Math.max(0, allLines.length - LOG_TAIL);
              const visible = showAllLogs ? allLines : allLines.slice(-LOG_TAIL);
              const offset = showAllLogs ? 0 : hidden;
              return (
                <div className="mb-6">
                  <h3 className="text-sm font-bold text-white uppercase mb-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-text-secondary">terminal</span>
                    Logs
                    <span className="text-xs font-normal text-slate-500 ml-1">({allLines.length} line{allLines.length !== 1 ? 's' : ''})</span>
                  </h3>
                  <div className="bg-[#0d1117] rounded-lg border border-slate-800 overflow-hidden font-mono text-sm">
                    <div className="p-4 max-h-[300px] overflow-y-auto">
                      {hidden > 0 && (
                        <button
                          onClick={() => setShowAllLogs(true)}
                          className="w-full text-center text-xs text-slate-500 hover:text-primary py-1.5 mb-2 border border-dashed border-slate-700 rounded hover:border-primary/40 transition-colors"
                        >
                          Show {hidden} earlier line{hidden !== 1 ? 's' : ''}
                        </button>
                      )}
                      {visible.map((line, i) => (
                        <div key={offset + i} className="flex">
                          <span className="w-8 text-slate-700 select-none text-right mr-3 shrink-0">{offset + i + 1}</span>
                          <span className={
                            line.includes('ERROR') ? 'text-red-400' :
                            line.startsWith('[w-bud]') ? 'text-primary' :
                            'text-slate-400'
                          }>{line}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Plan (read-only) */}
            {run.plan_md && (
              <div className="mb-6">
                <h3 className="text-sm font-bold text-white uppercase mb-3">Plan</h3>
                <div className="bg-surface-dark border border-border-dark rounded-lg p-4">
                  <pre className="whitespace-pre-wrap text-sm text-slate-300 font-mono">{run.plan_md}</pre>
                </div>
              </div>
            )}

            <div className="flex gap-3 justify-center mt-8">
              <button
                onClick={() => navigate('/')}
                className="px-6 py-2 border border-border-dark rounded-lg text-sm font-bold text-slate-300 hover:bg-surface-hover transition-colors"
              >
                Back to Sprint Board
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function agentLabel(agent?: string): string {
  if (agent === 'codex') return 'Codex CLI';
  if (agent === 'copilot') return 'Copilot CLI';
  return 'Cursor CLI';
}

function execColorLine(line: string): string {
  if (line.startsWith('SUCCESS')) return 'text-green-400';
  if (line.startsWith('PATCHING') || line.startsWith('WRITING')) return 'text-yellow-400';
  if (line.startsWith('TASK:')) return 'text-purple-400';
  if (line.startsWith('DONE')) return 'text-emerald-400 font-bold';
  return '';
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
