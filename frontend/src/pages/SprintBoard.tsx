import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Story, StoriesFile, Run, AppConfig } from '../types';
import Breadcrumbs from '../components/common/Breadcrumbs';
import EmptyState from '../components/common/EmptyState';

const statusColors: Record<string, { bg: string; text: string; dot: string }> = {
  'In Progress': { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-500' },
  'To Do': { bg: 'bg-slate-500/10', text: 'text-slate-400', dot: 'bg-slate-400' },
  'Done': { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-500' },
};

const priorityConfig: Record<string, { icon: string; color: string }> = {
  'Critical': { icon: 'priority_high', color: 'text-red-400' },
  'High': { icon: 'arrow_upward', color: 'text-red-500' },
  'Medium': { icon: 'remove', color: 'text-amber-500' },
  'Low': { icon: 'arrow_downward', color: 'text-slate-500' },
};

export default function SprintBoard() {
  const navigate = useNavigate();
  const [storiesFile, setStoriesFile] = useState<StoriesFile | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const [refreshSuccess, setRefreshSuccess] = useState(false);
  const [sprints, setSprints] = useState<{ id: number; name: string; state: string }[]>([]);
  const [selectedSprintId, setSelectedSprintId] = useState<string>('');
  const [selectedStories, setSelectedStories] = useState<string[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    loadData();
    api.getSprints().then(setSprints).catch(() => {});
    api.getConfig().then(setConfig).catch(() => {});
  }, []);

  async function loadData() {
    api.getStories().then(setStoriesFile).catch((e) => console.error('Failed to load stories:', e));
    api.getRuns().then(setRuns).catch((e) => console.error('Failed to load runs:', e));
  }

  async function handleRefresh(sprintId?: string) {
    setRefreshing(true);
    setRefreshError('');
    setRefreshSuccess(false);
    try {
      const sf = await api.refreshStories(sprintId || selectedSprintId || undefined);
      setStoriesFile(sf);
      setRefreshSuccess(true);
      setTimeout(() => setRefreshSuccess(false), 3000);
    } catch (e: any) {
      setRefreshError(e.message || 'Failed to refresh');
      setTimeout(() => setRefreshError(''), 5000);
    }
    setRefreshing(false);
  }

  function handleSprintChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    setSelectedSprintId(val);
    handleRefresh(val);
  }

  function toggleStorySelection(storyId: string) {
    setSelectedStories((prev) =>
      prev.includes(storyId) ? prev.filter((id) => id !== storyId) : [...prev, storyId]
    );
  }

  function handleConfigureMulti() {
    if (selectedStories.length === 0) return;
    if (selectedStories.length === 1) {
      navigate(`/story/${selectedStories[0]}`);
    } else {
      navigate(`/configure?stories=${selectedStories.join(',')}`);
    }
  }

  const activeRuns = runs.filter((r) => ['planning', 'awaiting_approval', 'executing'].includes(r.status));
  const recentRuns = runs
    .filter((r) => ['done', 'failed', 'aborted'].includes(r.status))
    .sort((a, b) => (b.started_at || '').localeCompare(a.started_at || ''))
    .slice(0, 5);

  return (
    <>
      {/* Header */}
      <header className="flex flex-col gap-4 border-b border-border-dark bg-panel-dark p-6 shadow-sm z-10">
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Sprint Board' }]} />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {storiesFile?.sprint_name || 'Sprint Board'}
            </h1>
            {storiesFile && (
              <p className="mt-1 text-sm text-text-secondary font-mono">
                {storiesFile.stories.length} stories
                {storiesFile.last_fetched &&
                  ` · Last refreshed ${new Date(storiesFile.last_fetched).toLocaleTimeString()}`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {sprints.length > 0 && (
              <select
                value={selectedSprintId}
                onChange={handleSprintChange}
                disabled={refreshing}
                className="rounded-lg border border-border-dark bg-surface-dark px-3 py-2.5 text-sm text-slate-300 focus:border-primary/50 focus:outline-none disabled:opacity-50"
              >
                <option value="">Current Sprint</option>
                {sprints.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.name} {s.state === 'active' ? '(active)' : '(future)'}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => handleRefresh()}
              disabled={refreshing}
              className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold transition-all duration-200 border shadow-sm cursor-pointer disabled:cursor-wait ${
                refreshing
                  ? 'bg-primary/20 text-primary border-primary/30 scale-95'
                  : refreshSuccess
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  : 'bg-surface-dark text-slate-300 border-border-dark hover:bg-primary/10 hover:text-primary hover:border-primary/30 hover:shadow-primary/10 hover:shadow-md active:scale-95'
              }`}
            >
              <span className={`material-symbols-outlined text-[20px] transition-transform duration-300 ${refreshing ? 'animate-spin' : refreshSuccess ? '' : ''}`}>
                {refreshSuccess ? 'check_circle' : 'sync'}
              </span>
              {refreshing ? 'Syncing...' : refreshSuccess ? 'Synced!' : 'Refresh from JIRA'}
            </button>
          </div>
        </div>

        {/* Error banner */}
        {refreshError && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            <span className="material-symbols-outlined text-[18px]">error</span>
            <span className="truncate">{refreshError}</span>
            <button onClick={() => setRefreshError('')} className="ml-auto text-red-400/60 hover:text-red-400">
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Story Table */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Setup banners */}
          {config && (!config.jira?.base_url || !config.workspaces_root || !config.agents?.planning_agent || !config.agents?.execution_agent) && (
            <div className="mb-4">
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-blue-400 text-[22px] mt-0.5 shrink-0">rocket_launch</span>
                  <div>
                    <p className="text-white font-bold text-base">Welcome to w-bud!</p>
                    <p className="text-slate-400 text-sm mt-1">Complete these steps in <Link to="/settings" className="text-primary hover:underline font-bold">Settings</Link> to get started.</p>
                  </div>
                </div>
                <div className="ml-9 space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className={`material-symbols-outlined text-[16px] ${config.jira?.base_url ? 'text-emerald-400' : 'text-slate-500'}`}>{config.jira?.base_url ? 'check_circle' : 'radio_button_unchecked'}</span>
                    <span className={config.jira?.base_url ? 'text-slate-500 line-through' : 'text-white'}>Connect your <Link to="/settings" className="text-primary hover:underline">JIRA</Link> instance</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`material-symbols-outlined text-[16px] ${config.workspaces_root ? 'text-emerald-400' : 'text-slate-500'}`}>{config.workspaces_root ? 'check_circle' : 'radio_button_unchecked'}</span>
                    <span className={config.workspaces_root ? 'text-slate-500 line-through' : 'text-white'}>Set a <Link to="/settings" className="text-primary hover:underline">workspace root</Link> directory</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`material-symbols-outlined text-[16px] ${config.agents?.planning_agent && config.agents?.execution_agent ? 'text-emerald-400' : 'text-slate-500'}`}>{config.agents?.planning_agent && config.agents?.execution_agent ? 'check_circle' : 'radio_button_unchecked'}</span>
                    <span className={config.agents?.planning_agent && config.agents?.execution_agent ? 'text-slate-500 line-through' : 'text-white'}>Choose your <Link to="/settings" className="text-primary hover:underline">agents</Link> for planning &amp; execution</span>
                  </div>
                  <div className="mt-3 pt-3 border-t border-blue-500/10 text-xs text-slate-500">
                    Optional: <Link to="/settings" className="text-slate-400 hover:underline">Global prompts</Link> and <Link to="/settings" className="text-slate-400 hover:underline">Webex notifications</Link> can be configured later.
                  </div>
                </div>
              </div>
            </div>
          )}
          <div className="rounded-xl border border-border-dark bg-panel-dark shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-dark text-xs uppercase font-semibold text-text-secondary">
                  <tr>
                    <th className="px-3 py-4 w-12">
                      <input
                        type="checkbox"
                        className="accent-primary w-4 h-4 cursor-pointer"
                        checked={storiesFile != null && storiesFile.stories.length > 0 && selectedStories.length === storiesFile.stories.length}
                        onChange={() => {
                          if (!storiesFile) return;
                          if (selectedStories.length === storiesFile.stories.length) {
                            setSelectedStories([]);
                          } else {
                            setSelectedStories(storiesFile.stories.map((s) => s.id));
                          }
                        }}
                      />
                    </th>
                    <th className="px-6 py-4 w-44">ID</th>
                    <th className="px-6 py-4 min-w-[300px]">Story Title</th>
                    <th className="px-6 py-4 w-40">Status</th>
                    <th className="px-6 py-4 w-40">Priority</th>
                    <th className="px-6 py-4 w-24 text-center">Pts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-dark text-slate-300">
                  {storiesFile?.stories.map((story) => (
                    <StoryRow
                      key={story.id}
                      story={story}
                      run={runs.find((r) => r.story_id === story.id && r.status !== 'done' && r.status !== 'failed' && r.status !== 'aborted')}
                      checked={selectedStories.includes(story.id)}
                      onToggle={() => toggleStorySelection(story.id)}
                      onSelect={() => navigate(`/story/${story.id}`)}
                    />
                  ))}
                  {storiesFile && storiesFile.stories.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-16">
                        <EmptyState icon="inbox" message="No stories found in this sprint." />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {storiesFile && (
              <div className="flex items-center justify-between border-t border-border-dark bg-surface-dark px-6 py-3">
                <div className="text-xs text-text-secondary">
                  Showing {storiesFile.stories.length} stories
                </div>
              </div>
            )}
          </div>

          {/* Floating action bar for multi-story selection */}
          {selectedStories.length > 0 && (
            <div className="mt-4 flex items-center justify-between bg-primary/10 border border-primary/30 rounded-xl px-5 py-3 shadow-lg">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary text-[20px]">checklist</span>
                <span className="text-sm font-medium text-white">
                  {selectedStories.length} {selectedStories.length === 1 ? 'story' : 'stories'} selected
                </span>
                <button
                  onClick={() => setSelectedStories([])}
                  className="text-xs text-slate-400 hover:text-white transition-colors ml-1 cursor-pointer"
                >
                  Clear
                </button>
              </div>
              <button
                onClick={handleConfigureMulti}
                className="flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary-dark rounded-lg text-white text-sm font-bold shadow-md shadow-primary/20 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">smart_toy</span>
                Configure Run for {selectedStories.length} {selectedStories.length === 1 ? 'Story' : 'Stories'}
              </button>
            </div>
          )}
        </div>

        {/* Right Panel: Run Orchestrator */}
        <aside className="flex w-96 shrink-0 flex-col border-l border-border-dark bg-panel-dark z-20">
          <div className="flex items-center justify-between border-b border-border-dark p-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-text-secondary">Run Orchestrator</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Active Runs */}
            {activeRuns.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-2 w-2 rounded-full bg-primary animate-pulse"></div>
                  <h3 className="text-xs font-semibold uppercase text-slate-200">Active Runs</h3>
                </div>
                {activeRuns.map((run) => (
                  <div
                    key={run.run_id}
                    onClick={() => navigate(`/run/${run.run_id}`)}
                    className="rounded-lg border border-primary/20 bg-surface-dark p-3 shadow-md cursor-pointer hover:bg-surface-hover transition-colors"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-primary">{(run.story_ids || [run.story_id]).join(', ')}</span>
                      <span className="text-[10px] font-medium text-text-secondary capitalize">{run.status.replace('_', ' ')}</span>
                    </div>
                    <p className="text-sm font-medium text-slate-200 leading-tight">{run.story_summary}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Recent History */}
            {recentRuns.length > 0 && (
              <div className="space-y-3 pt-2 border-t border-border-dark/50">
                <h3 className="text-xs font-semibold uppercase text-slate-500 mb-2">Recent History</h3>
                {recentRuns.map((run) => (
                  <div
                    key={run.run_id}
                    onClick={() => navigate(`/run/${run.run_id}`)}
                    className="flex gap-3 items-start cursor-pointer rounded-md p-2 hover:bg-surface-hover transition-colors"
                  >
                    <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded ${
                      run.status === 'done' ? 'bg-emerald-500/10 text-emerald-500' :
                      run.status === 'failed' ? 'bg-red-500/10 text-red-500' :
                      'bg-amber-500/10 text-amber-500'
                    }`}>
                      <span className="material-symbols-outlined text-[14px]">
                        {run.status === 'done' ? 'check' : run.status === 'failed' ? 'close' : 'do_not_disturb_on'}
                      </span>
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-slate-300 shrink-0">{(run.story_ids || [run.story_id]).join(', ')}</span>
                        {run.duration_seconds && (
                          <span className="text-[10px] text-text-secondary">
                            {Math.floor(run.duration_seconds / 60)}m {Math.floor(run.duration_seconds % 60)}s
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-text-secondary">{run.story_summary}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeRuns.length === 0 && recentRuns.length === 0 && (
              <div className="mt-8">
                <EmptyState icon="smart_toy" message="No runs yet. Select a story to begin." />
              </div>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}

function StoryRow({ story, run, checked, onToggle, onSelect }: { story: Story; run?: Run; checked: boolean; onToggle: () => void; onSelect: () => void }) {
  const status = statusColors[story.status] || statusColors['To Do'];
  const priority = priorityConfig[story.priority] || priorityConfig['Medium'];
  const isRunning = !!run;

  return (
    <tr className={`group hover:bg-surface-hover transition-colors cursor-pointer ${checked ? 'bg-primary/5' : ''}`} onClick={onSelect}>
      <td className="px-3 py-4" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          className="accent-primary w-4 h-4 cursor-pointer"
          checked={checked}
          onChange={onToggle}
        />
      </td>
      <td className="px-6 py-4 font-mono text-primary font-medium">
        {story.id}
        {isRunning && (
          <span className="ml-2 text-xs font-bold text-amber-400 animate-pulse">Running...</span>
        )}
      </td>
      <td className="px-6 py-4 font-medium text-white">{story.summary}</td>
      <td className="px-6 py-4">
        <span className={`inline-flex items-center gap-1.5 rounded-full ${status.bg} px-2.5 py-1 text-xs font-medium ${status.text} border border-current/20`}>
          <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`}></span>
          {story.status}
        </span>
      </td>
      <td className="px-6 py-4">
        <div className={`flex items-center gap-2 ${priority.color}`}>
          <span className="material-symbols-outlined text-[18px]">{priority.icon}</span>
          <span className="text-xs font-medium uppercase">{story.priority}</span>
        </div>
      </td>
      <td className="px-6 py-4 text-center font-mono">{story.points}</td>
    </tr>
  );
}
