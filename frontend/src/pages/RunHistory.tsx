import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { Run } from '../types';
import Breadcrumbs from '../components/common/Breadcrumbs';

const statusConfig: Record<string, { icon: string; bg: string; text: string; label: string }> = {
  done: { icon: 'check_circle', bg: 'bg-emerald-500/10 border-emerald-500/20', text: 'text-emerald-400', label: 'Success' },
  failed: { icon: 'cancel', bg: 'bg-rose-500/10 border-rose-500/20', text: 'text-rose-400', label: 'Failed' },
  aborted: { icon: 'do_not_disturb_on', bg: 'bg-amber-500/10 border-amber-500/20', text: 'text-amber-400', label: 'Aborted' },
  planning: { icon: 'smart_toy', bg: 'bg-primary/10 border-primary/20', text: 'text-primary', label: 'Planning' },
  awaiting_approval: { icon: 'hourglass_top', bg: 'bg-amber-500/10 border-amber-500/20', text: 'text-amber-400', label: 'Awaiting' },
  executing: { icon: 'play_arrow', bg: 'bg-primary/10 border-primary/20', text: 'text-primary', label: 'Executing' },
};

export default function RunHistory() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<Run[]>([]);
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);

  useEffect(() => {
    loadRuns();
  }, []);

  async function loadRuns() {
    try {
      const r = await api.getRuns();
      setRuns(r.reverse());
    } catch (e) {
      console.error('Failed to load runs:', e);
    }
  }

  const filtered = runs.filter((r) => {
    const allIds = (r.story_ids || [r.story_id]).join(' ').toLowerCase();
    const matchesSearch = !filter ||
      allIds.includes(filter.toLowerCase()) ||
      r.story_summary.toLowerCase().includes(filter.toLowerCase());
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  function formatDuration(seconds: number | null): string {
    if (!seconds) return '-';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}m ${s}s`;
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' +
      d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  return (
    <div className="flex h-full">
      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Header */}
        <header className="flex flex-col gap-4 px-8 py-6 border-b border-border-dark bg-panel-dark/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div>
              <Breadcrumbs items={[
                { label: 'Home', to: '/' },
                { label: 'Run History' },
              ]} />
              <h2 className="text-2xl font-bold text-white tracking-tight mt-2">Run History</h2>
              <p className="text-text-secondary text-sm mt-1">All execution runs across sprints</p>
            </div>
          </div>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <div className="relative flex-1 min-w-[240px] max-w-md group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="material-symbols-outlined text-slate-500 group-focus-within:text-primary transition-colors">search</span>
              </div>
              <input
                className="block w-full pl-10 pr-3 py-2 border border-border-dark rounded-lg bg-surface-dark text-slate-300 placeholder-slate-500 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm transition-all"
                placeholder="Search by Story ID or Summary..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
            <div className="h-6 w-px bg-border-dark mx-1"></div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-surface-dark border border-border-dark rounded-lg text-slate-300 text-sm focus:outline-none focus:border-primary"
            >
              <option value="all">All Status</option>
              <option value="done">Success</option>
              <option value="failed">Failed</option>
              <option value="aborted">Aborted</option>
              <option value="executing">Executing</option>
              <option value="planning">Planning</option>
            </select>
            <div className="ml-auto text-xs text-slate-500 font-mono">
              {filtered.length} runs
            </div>
          </div>
        </header>

        {/* Table */}
        <div className="flex-1 overflow-auto p-8 pt-4">
          <div className="border border-border-dark rounded-lg overflow-hidden bg-panel-dark shadow-xl">
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-dark text-text-secondary text-xs uppercase font-medium tracking-wider sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-3 font-semibold border-b border-border-dark w-32">Story ID</th>
                  <th className="px-6 py-3 font-semibold border-b border-border-dark">Summary</th>
                  <th className="px-6 py-3 font-semibold border-b border-border-dark w-40">Status</th>
                  <th className="px-6 py-3 font-semibold border-b border-border-dark w-32">Duration</th>
                  <th className="px-6 py-3 font-semibold border-b border-border-dark w-48">Started At</th>
                  <th className="px-6 py-3 font-semibold border-b border-border-dark w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-dark text-sm">
                {filtered.map((run) => {
                  const sc = statusConfig[run.status] || statusConfig.planning;
                  return (
                    <tr
                      key={run.run_id}
                      className="group hover:bg-surface-hover transition-colors cursor-pointer"
                      onClick={() => setSelectedRun(run)}
                    >
                      <td className="px-6 py-3 font-mono text-primary group-hover:underline decoration-primary underline-offset-4">
                        {(run.story_ids || [run.story_id]).join(', ')}
                      </td>
                      <td className="px-6 py-3 text-slate-300 font-medium truncate max-w-xs">
                        {run.story_summary}
                      </td>
                      <td className="px-6 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium ${sc.bg} ${sc.text} border`}>
                          <span className="material-symbols-outlined text-[14px]">{sc.icon}</span>
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-text-secondary font-mono">
                        {formatDuration(run.duration_seconds)}
                      </td>
                      <td className="px-6 py-3 text-text-secondary font-mono text-xs">
                        {formatDate(run.started_at)}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <span className="material-symbols-outlined text-slate-600 group-hover:text-white transition-colors text-[20px]">
                          chevron_right
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center text-text-secondary">
                      {runs.length === 0 ? 'No runs yet.' : 'No matching runs found.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Drawer */}
      {selectedRun && (
        <>
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-40"
            onClick={() => setSelectedRun(null)}
          />
          <aside className="fixed top-0 right-0 h-full w-[600px] bg-[#0f172a] border-l border-border-dark shadow-2xl z-50 flex flex-col">
            {/* Drawer Header */}
            <div className="flex items-start justify-between p-6 border-b border-border-dark bg-surface-dark">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-xl font-bold text-white font-mono">{(selectedRun.story_ids || [selectedRun.story_id]).join(', ')}</h3>
                  <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${statusConfig[selectedRun.status]?.bg} ${statusConfig[selectedRun.status]?.text} border`}>
                    {statusConfig[selectedRun.status]?.label}
                  </span>
                </div>
                <p className="text-text-secondary text-sm">{selectedRun.story_summary}</p>
                <div className="flex gap-4 mt-3 text-xs text-slate-500 font-mono">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">schedule</span>
                    {formatDuration(selectedRun.duration_seconds)}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                    {formatDate(selectedRun.started_at)}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedRun(null)}
                className="p-2 rounded-lg hover:bg-surface-hover text-text-secondary hover:text-white transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Plan */}
              {selectedRun.plan_md && (
                <div className="mb-6">
                  <h4 className="text-sm font-bold text-white uppercase mb-3">Execution Plan</h4>
                  <div className="bg-[#0a0f16] rounded-lg p-4 border border-border-dark">
                    <pre className="whitespace-pre-wrap text-sm text-slate-300 font-mono">{selectedRun.plan_md}</pre>
                  </div>
                </div>
              )}

              {/* Changed Files */}
              {(selectedRun.changed_files || []).length > 0 && (
                <div className="mb-6">
                  <h4 className="text-sm font-bold text-white uppercase mb-3">Changed Files</h4>
                  <div className="space-y-1">
                    {(selectedRun.changed_files || []).map((f) => (
                      <div key={f} className="flex items-center gap-2 px-3 py-2 bg-surface-dark rounded text-sm font-mono text-slate-300">
                        <span className="material-symbols-outlined text-green-500 text-[16px]">description</span>
                        {f}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Error */}
              {selectedRun.error && (
                <div className="mb-6">
                  <h4 className="text-sm font-bold text-red-400 uppercase mb-3">Error</h4>
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                    <pre className="text-sm text-red-400 font-mono whitespace-pre-wrap">{selectedRun.error}</pre>
                  </div>
                </div>
              )}

              {/* Repos */}
              <div className="mb-6">
                <h4 className="text-sm font-bold text-white uppercase mb-3">Repositories</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedRun.repos.map((r) => (
                    <span key={r} className="bg-primary/10 text-primary border border-primary/20 px-3 py-1 rounded text-xs font-mono">
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-border-dark bg-surface-dark flex justify-between items-center">
              <button className="text-sm text-primary hover:underline flex items-center gap-1">
                <span className="material-symbols-outlined text-[18px]">download</span>
                Download log
              </button>
              <button
                onClick={() => { setSelectedRun(null); navigate(`/run/${selectedRun.run_id}`); }}
                className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-dark rounded-lg transition-colors shadow-lg shadow-primary/20"
              >
                View Full Details
              </button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
