import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { AppConfig, GlobalPrompt } from '../types';
import Breadcrumbs from '../components/common/Breadcrumbs';
import FolderBrowser from '../components/common/FolderBrowser';
import { CursorIcon, OpenAIIcon, CopilotIcon } from '../components/common/AgentIcons';

export default function Settings() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [showBrowse, setShowBrowse] = useState(false);
  const [newPromptText, setNewPromptText] = useState('');
  const [newPromptTag, setNewPromptTag] = useState<'planning' | 'execution' | 'both'>('both');
  const [agentStatus, setAgentStatus] = useState<Record<string, { available: boolean; version?: string; error?: string; checking: boolean }>>({});

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    try {
      const cfg = await api.getConfig();
      // Ensure fields have defaults if missing from older config
      if (!cfg.agents) {
        cfg.agents = { planning_agent: 'cursor', execution_agent: 'codex', auto_approve_plan: false };
      }
      if (!cfg.webex) {
        cfg.webex = { token: '', room_id: '' };
      }
      if (!cfg.global_prompts) {
        cfg.global_prompts = [];
      }
      setConfig(cfg);
      // Check agent availability
      checkAllAgents();
    } catch (e: any) {
      setError(e.message);
    }
  }

  // Auto-clear agent selection when version check reports unavailable
  useEffect(() => {
    if (!config) return;
    let updated = false;
    let newAgents = { ...config.agents };
    for (const agent of ['cursor', 'codex', 'copilot']) {
      const s = agentStatus[agent];
      if (s && !s.checking && !s.available) {
        if (newAgents.planning_agent === agent) {
          newAgents = { ...newAgents, planning_agent: '' };
          updated = true;
        }
        if (newAgents.execution_agent === agent) {
          newAgents = { ...newAgents, execution_agent: '' };
          updated = true;
        }
      }
    }
    if (updated) {
      const updatedConfig = { ...config, agents: newAgents };
      setConfig(updatedConfig);
      // Persist immediately so other pages see the cleared selection
      api.updateConfig(updatedConfig).catch(() => {});
    }
  }, [agentStatus]);

  const agentIcons: Record<string, React.ReactNode> = {
    cursor: <CursorIcon />,
    codex: <OpenAIIcon />,
    copilot: <CopilotIcon />,
  };
  const agentInfo: Record<string, { label: string; desc: string; installUrl: string }> = {
    cursor: { label: 'Cursor Agent', desc: 'Uses Cursor IDE background agent', installUrl: 'https://cursor.com/docs/cli/installation' },
    codex: { label: 'Codex CLI', desc: 'Uses OpenAI Codex CLI', installUrl: 'https://developers.openai.com/codex/cli/' },
    copilot: { label: 'Copilot CLI', desc: 'Uses GitHub Copilot CLI', installUrl: 'https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli' },
  };
  const agentKeys = ['cursor', 'codex', 'copilot'] as const;

  async function checkAllAgents() {
    for (const agent of agentKeys) {
      checkAgent(agent);
    }
  }

  async function checkAgent(agent: string) {
    setAgentStatus((prev) => ({ ...prev, [agent]: { available: false, checking: true } }));
    try {
      const result = await api.checkAgent(agent);
      setAgentStatus((prev) => ({ ...prev, [agent]: { ...result, checking: false } }));
    } catch {
      setAgentStatus((prev) => ({ ...prev, [agent]: { available: false, error: 'Check failed', checking: false } }));
    }
  }

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const updated = await api.updateConfig(config);
      setConfig(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    if (!config) return;
    setTesting(true);
    setTestResult(null);
    try {
      // Save first, then try refresh
      await api.updateConfig(config);
      await api.refreshStories();
      setTestResult({ ok: true, message: 'Connected successfully! Stories fetched from JIRA.' });
    } catch (e: any) {
      setTestResult({ ok: false, message: e.message });
    } finally {
      setTesting(false);
    }
  }

  function updateJira(field: string, value: string) {
    if (!config) return;
    setConfig({ ...config, jira: { ...config.jira, [field]: value } });
  }

  function updateWebex(field: string, value: string) {
    if (!config) return;
    setConfig({ ...config, webex: { ...config.webex, [field]: value } });
  }

  function addPrompt() {
    if (!config || !newPromptText.trim()) return;
    const prompt: GlobalPrompt = {
      id: `gp-${Date.now()}`,
      text: newPromptText.trim(),
      tag: newPromptTag,
      enabled: true,
    };
    setConfig({ ...config, global_prompts: [...config.global_prompts, prompt] });
    setNewPromptText('');
  }

  function removePrompt(id: string) {
    if (!config) return;
    setConfig({ ...config, global_prompts: config.global_prompts.filter((p) => p.id !== id) });
  }

  function togglePrompt(id: string) {
    if (!config) return;
    setConfig({
      ...config,
      global_prompts: config.global_prompts.map((p) =>
        p.id === id ? { ...p, enabled: !p.enabled } : p
      ),
    });
  }

  function updatePromptTag(id: string, tag: 'planning' | 'execution' | 'both') {
    if (!config) return;
    setConfig({
      ...config,
      global_prompts: config.global_prompts.map((p) =>
        p.id === id ? { ...p, tag } : p
      ),
    });
  }

  if (!config) {
    return (
      <div className="flex-1 flex items-center justify-center">
        {error ? (
          <p className="text-red-400">{error}</p>
        ) : (
          <span className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
        )}
      </div>
    );
  }

  return (
    <>
    {showBrowse && (
      <FolderBrowser
        initialPath={config.workspaces_root || undefined}
        onSelect={(selected) => {
          setConfig({ ...config, workspaces_root: selected });
          setShowBrowse(false);
        }}
        onCancel={() => setShowBrowse(false)}
      />
    )}
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex flex-col gap-6 p-8 pb-0">
        <Breadcrumbs items={[
          { label: 'Home', to: '/' },
          { label: 'Settings' },
        ]} />
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-text-secondary text-sm mt-1">Configure application preferences</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 pt-6">
        <div className="max-w-2xl space-y-8">

          {/* JIRA Configuration */}
          <section className="bg-panel-dark border border-border-dark rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border-dark flex items-center gap-3">
              <span className="material-symbols-outlined text-primary">cloud_sync</span>
              <div>
                <h2 className="text-white font-bold">JIRA Integration</h2>
                <p className="text-text-secondary text-xs mt-0.5">Connect to your JIRA instance to fetch sprint stories</p>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs text-text-secondary mb-1.5 font-medium">JIRA Base URL</label>
                <input
                  className="w-full bg-bg-dark border border-border-dark rounded-lg text-sm text-white px-3 py-2.5 focus:ring-1 focus:ring-primary focus:border-primary font-mono"
                  placeholder="https://yourorg.atlassian.net"
                  value={config.jira.base_url}
                  onChange={(e) => updateJira('base_url', e.target.value)}
                />
                <p className="text-text-secondary text-xs mt-1">Your Atlassian Cloud or JIRA Server URL</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5 font-medium">Email</label>
                  <input
                    className="w-full bg-bg-dark border border-border-dark rounded-lg text-sm text-white px-3 py-2.5 focus:ring-1 focus:ring-primary focus:border-primary"
                    placeholder="cec_Id@cisco.com"
                    value={config.jira.email}
                    onChange={(e) => updateJira('email', e.target.value)}
                  />
                  <p className="text-text-secondary text-xs mt-1">cec_Id@cisco.com</p>
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5 font-medium">API Token / PAT</label>
                  <input
                    type="password"
                    className="w-full bg-bg-dark border border-border-dark rounded-lg text-sm text-white px-3 py-2.5 focus:ring-1 focus:ring-primary focus:border-primary font-mono"
                    placeholder="Enter API token"
                    value={config.jira.api_token}
                    onChange={(e) => updateJira('api_token', e.target.value)}
                  />
                  <p className="text-text-secondary text-xs mt-1">
                    <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      Generate API token
                    </a>
                    {' '}for Cloud, or use a PAT for Server
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5 font-medium">Board ID</label>
                  <input
                    className="w-full bg-bg-dark border border-border-dark rounded-lg text-sm text-white px-3 py-2.5 focus:ring-1 focus:ring-primary focus:border-primary font-mono"
                    placeholder="e.g. 42"
                    value={config.jira.board_id}
                    onChange={(e) => updateJira('board_id', e.target.value)}
                  />
                  <p className="text-text-secondary text-xs mt-1">
                    Find in the board URL: <code className="text-slate-400">/board/42</code>
                  </p>
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5 font-medium">Sprint ID <span className="text-slate-500">(optional)</span></label>
                  <input
                    className="w-full bg-bg-dark border border-border-dark rounded-lg text-sm text-white px-3 py-2.5 focus:ring-1 focus:ring-primary focus:border-primary font-mono"
                    placeholder="Auto-detect active sprint"
                    value={config.jira.sprint_id || ''}
                    onChange={(e) => updateJira('sprint_id', e.target.value)}
                  />
                  <p className="text-text-secondary text-xs mt-1">
                    Leave blank to auto-fetch current active sprint
                  </p>
                </div>
              </div>

              {/* Test Connection */}
              {testResult && (
                <div className={`flex items-start gap-2 p-3 rounded-lg border text-sm ${
                  testResult.ok
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                    : 'bg-red-500/10 border-red-500/20 text-red-400'
                }`}>
                  <span className="material-symbols-outlined text-[18px] mt-0.5 shrink-0">
                    {testResult.ok ? 'check_circle' : 'error'}
                  </span>
                  <span className="break-all">{testResult.message}</span>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleTestConnection}
                  disabled={testing}
                  className="flex items-center gap-2 px-4 py-2 border border-border-dark rounded-lg text-sm text-slate-300 hover:bg-surface-hover transition-colors disabled:opacity-50"
                >
                  {testing ? (
                    <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                  ) : (
                    <span className="material-symbols-outlined text-[18px]">wifi_tethering</span>
                  )}
                  Test Connection
                </button>
              </div>
            </div>
          </section>

          {/* Webex Notifications */}
          <section className="bg-panel-dark border border-border-dark rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border-dark flex items-center gap-3">
              <span className="material-symbols-outlined text-primary">chat</span>
              <div>
                <h2 className="text-white font-bold">Webex Notifications</h2>
                <p className="text-text-secondary text-xs mt-0.5">Get notified in a Webex room when runs change status</p>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs text-text-secondary mb-1.5 font-medium">Bot Token</label>
                <input
                  type="password"
                  className="w-full bg-bg-dark border border-border-dark rounded-lg text-sm text-white px-3 py-2.5 focus:ring-1 focus:ring-primary focus:border-primary font-mono"
                  placeholder="Enter Webex bot token"
                  value={config.webex?.token || ''}
                  onChange={(e) => updateWebex('token', e.target.value)}
                />
                <p className="text-text-secondary text-xs mt-1">
                  Create a bot at{' '}
                  <a href="https://developer.webex.com/my-apps/new" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    developer.webex.com
                  </a>
                </p>
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1.5 font-medium">Room ID</label>
                <input
                  className="w-full bg-bg-dark border border-border-dark rounded-lg text-sm text-white px-3 py-2.5 focus:ring-1 focus:ring-primary focus:border-primary font-mono"
                  placeholder="e.g. Y2lzY29zcGFyay..."
                  value={config.webex?.room_id || ''}
                  onChange={(e) => updateWebex('room_id', e.target.value)}
                />
                <p className="text-text-secondary text-xs mt-1">The Webex room/space ID where notifications will be sent</p>
              </div>
            </div>
          </section>

          {/* CLI Agents */}
          <section className="bg-panel-dark border border-border-dark rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border-dark flex items-center gap-3">
              <span className="material-symbols-outlined text-primary">smart_toy</span>
              <div>
                <h2 className="text-white font-bold">CLI Agents</h2>
                <p className="text-text-secondary text-xs mt-0.5">Choose which AI agents handle planning and execution - Login before using</p>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5 font-medium">Planning Agent</label>
                  <div className="flex flex-col gap-2">
                    {agentKeys.map((agent) => {
                      const status = agentStatus[agent];
                      const info = agentInfo[agent];
                      const isDisabled = status && !status.checking && !status.available;
                      return (
                        <button
                          key={agent}
                          disabled={!!isDisabled}
                          onClick={() => !isDisabled && setConfig({ ...config, agents: { ...config.agents, planning_agent: agent } })}
                          className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                            isDisabled
                              ? 'bg-bg-dark border-border-dark text-slate-600 cursor-not-allowed'
                              : config.agents.planning_agent === agent
                                ? 'bg-primary/10 border-primary/30 text-white cursor-pointer'
                                : 'bg-bg-dark border-border-dark text-slate-400 hover:border-slate-600 hover:text-slate-300 cursor-pointer'
                          }`}
                        >
                          <div className={`shrink-0 ${
                            isDisabled ? 'text-slate-600' : config.agents.planning_agent === agent ? 'text-primary' : 'text-slate-500'
                          }`}>
                            {agentIcons[agent]}
                          </div>
                          <div className="flex-1">
                            <span className="text-sm font-bold">{info.label}</span>
                            <p className="text-xs text-text-secondary mt-0.5">{info.desc}</p>
                            {status && !status.checking && (
                              <p className={`text-[10px] mt-1 font-mono ${
                                status.available ? 'text-emerald-400' : 'text-red-400'
                              }`}>
                                {status.available ? `✓ ${status.version}` : `✗ Not installed`}
                              </p>
                            )}
                            {status?.checking && (
                              <p className="text-[10px] mt-1 text-text-secondary">Checking...</p>
                            )}
                            {status && !status.checking && !status.available && (
                              <a href={info.installUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] mt-0.5 text-primary hover:underline inline-block cursor-pointer" onClick={(e) => e.stopPropagation()}>Install guide →</a>
                            )}
                          </div>
                          {config.agents.planning_agent === agent && !isDisabled && (
                            <span className="material-symbols-outlined text-primary text-[18px] ml-auto">check_circle</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1.5 font-medium">Execution Agent</label>
                  <div className="flex flex-col gap-2">
                    {agentKeys.map((agent) => {
                      const status = agentStatus[agent];
                      const info = agentInfo[agent];
                      const isDisabled = status && !status.checking && !status.available;
                      return (
                        <button
                          key={agent}
                          disabled={!!isDisabled}
                          onClick={() => !isDisabled && setConfig({ ...config, agents: { ...config.agents, execution_agent: agent } })}
                          className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                            isDisabled
                              ? 'bg-bg-dark border-border-dark text-slate-600 cursor-not-allowed'
                              : config.agents.execution_agent === agent
                                ? 'bg-primary/10 border-primary/30 text-white cursor-pointer'
                                : 'bg-bg-dark border-border-dark text-slate-400 hover:border-slate-600 hover:text-slate-300 cursor-pointer'
                          }`}
                        >
                          <div className={`shrink-0 ${
                            isDisabled ? 'text-slate-600' : config.agents.execution_agent === agent ? 'text-primary' : 'text-slate-500'
                          }`}>
                            {agentIcons[agent]}
                          </div>
                          <div className="flex-1">
                            <span className="text-sm font-bold">{info.label}</span>
                            <p className="text-xs text-text-secondary mt-0.5">{info.desc}</p>
                            {status && !status.checking && (
                              <p className={`text-[10px] mt-1 font-mono ${
                                status.available ? 'text-emerald-400' : 'text-red-400'
                              }`}>
                                {status.available ? `✓ ${status.version}` : `✗ Not installed`}
                              </p>
                            )}
                            {status?.checking && (
                              <p className="text-[10px] mt-1 text-text-secondary">Checking...</p>
                            )}
                            {status && !status.checking && !status.available && (
                              <a href={info.installUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] mt-0.5 text-primary hover:underline inline-block cursor-pointer" onClick={(e) => e.stopPropagation()}>Install guide →</a>
                            )}
                          </div>
                          {config.agents.execution_agent === agent && !isDisabled && (
                            <span className="material-symbols-outlined text-primary text-[18px] ml-auto">check_circle</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Auto-Approve Toggle */}
            <div className="px-6 pb-6">
              <div className="flex items-center justify-between p-4 bg-bg-dark rounded-lg border border-border-dark">
                <div>
                  <p className="text-sm font-medium text-white">Auto-Approve Plans</p>
                  <p className="text-xs text-text-secondary mt-0.5">Skip manual approval and proceed directly to execution</p>
                </div>
                <button
                  onClick={() => setConfig({ ...config, agents: { ...config.agents, auto_approve_plan: !config.agents.auto_approve_plan } })}
                  className={`shrink-0 w-11 h-6 rounded-full relative transition-colors cursor-pointer ${
                    config.agents.auto_approve_plan ? 'bg-primary' : 'bg-slate-700'
                  }`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                    config.agents.auto_approve_plan ? 'left-[22px]' : 'left-0.5'
                  }`} />
                </button>
              </div>
            </div>
          </section>

          {/* Global Prompts */}
          <section className="bg-panel-dark border border-border-dark rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border-dark flex items-center gap-3">
              <span className="material-symbols-outlined text-primary">description</span>
              <div>
                <h2 className="text-white font-bold">Global Prompts</h2>
                <p className="text-text-secondary text-xs mt-0.5">Default instructions sent with every planning or execution request</p>
              </div>
            </div>
            <div className="p-5">
              {/* Prompt list */}
              {config.global_prompts.length > 0 ? (
                <div className="mb-4 rounded-lg border border-border-dark overflow-hidden divide-y divide-border-dark/60">
                  {config.global_prompts.map((prompt) => (
                    <div
                      key={prompt.id}
                      className={`group flex items-center gap-2.5 px-3 py-2.5 transition-colors ${
                        prompt.enabled ? 'bg-surface-dark/30 hover:bg-surface-dark/60' : 'bg-bg-dark/50 opacity-50'
                      }`}
                    >
                      <button
                        onClick={() => togglePrompt(prompt.id)}
                        className={`shrink-0 w-9 h-5 rounded-full relative transition-colors cursor-pointer ${
                          prompt.enabled ? 'bg-primary' : 'bg-slate-700'
                        }`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                          prompt.enabled ? 'left-[18px]' : 'left-0.5'
                        }`} />
                      </button>
                      <p className="flex-1 text-[13px] text-slate-300 truncate">{prompt.text}</p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {(['planning', 'execution', 'both'] as const).map((tag) => (
                          <button
                            key={tag}
                            onClick={() => updatePromptTag(prompt.id, tag)}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                              prompt.tag === tag
                                ? tag === 'planning'
                                  ? 'bg-violet-500/20 text-violet-400 ring-1 ring-violet-500/30'
                                  : tag === 'execution'
                                  ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30'
                                  : 'bg-primary/20 text-primary ring-1 ring-primary/30'
                                : 'text-slate-600 hover:text-slate-400'
                            }`}
                          >
                            {tag === 'planning' ? 'Plan' : tag === 'execution' ? 'Exec' : 'Both'}
                          </button>
                        ))}
                        <button
                          onClick={() => removePrompt(prompt.id)}
                          className="ml-1 text-slate-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                          title="Remove"
                        >
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center py-6 mb-4 rounded-lg border border-dashed border-border-dark text-text-secondary">
                  <span className="material-symbols-outlined text-3xl mb-1 text-slate-700">playlist_add</span>
                  <p className="text-xs">No prompts yet. Add your first one below.</p>
                </div>
              )}

              {/* Add new prompt — inline bar */}
              <div className="flex items-start gap-2 bg-bg-dark rounded-lg border border-border-dark p-2">
                <textarea
                  className="flex-1 bg-transparent text-sm text-white px-2 py-1.5 resize-none placeholder-slate-600 focus:outline-none"
                  rows={1}
                  placeholder="Add a prompt instruction..."
                  value={newPromptText}
                  onChange={(e) => setNewPromptText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addPrompt(); } }}
                />
                <div className="flex items-center gap-1.5 shrink-0 pt-1">
                  {(['planning', 'execution', 'both'] as const).map((tag) => (
                    <button
                      key={tag}
                      onClick={() => setNewPromptTag(tag)}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                        newPromptTag === tag
                          ? tag === 'planning'
                            ? 'bg-violet-500/20 text-violet-400 ring-1 ring-violet-500/30'
                            : tag === 'execution'
                            ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30'
                            : 'bg-primary/20 text-primary ring-1 ring-primary/30'
                          : 'text-slate-600 hover:text-slate-400'
                      }`}
                    >
                      {tag === 'planning' ? 'Plan' : tag === 'execution' ? 'Exec' : 'Both'}
                    </button>
                  ))}
                  <button
                    onClick={addPrompt}
                    disabled={!newPromptText.trim()}
                    className="ml-1 flex items-center justify-center w-7 h-7 rounded-md bg-primary/20 text-primary hover:bg-primary/30 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <span className="material-symbols-outlined text-[18px]">add</span>
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* General */}
          <section className="bg-panel-dark border border-border-dark rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border-dark flex items-center gap-3">
              <span className="material-symbols-outlined text-primary">tune</span>
              <div>
                <h2 className="text-white font-bold">General</h2>
                <p className="text-text-secondary text-xs mt-0.5">Application-wide settings</p>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs text-text-secondary mb-1.5 font-medium">Workspaces Root</label>
                <div className="flex gap-2">
                  <div className="flex-1 flex items-center bg-bg-dark border border-border-dark rounded-lg px-3 py-2.5 font-mono text-sm text-white min-h-[42px]">
                    {config.workspaces_root || <span className="text-slate-500">No folder selected</span>}
                  </div>
                  <button
                    onClick={() => setShowBrowse(true)}
                    className="flex items-center gap-1.5 px-3 py-2.5 bg-surface-dark border border-border-dark rounded-lg text-sm text-slate-300 hover:bg-surface-hover hover:text-white transition-colors shrink-0"
                  >
                    <span className="material-symbols-outlined text-[18px]">folder_open</span>
                    Browse
                  </button>
                </div>
                <p className="text-text-secondary text-xs mt-1">Directory where git worktrees will be created for runs</p>
              </div>
            </div>
          </section>

          {/* Error / Save */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              <span className="material-symbols-outlined text-[18px]">error</span>
              {error}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary-dark rounded-lg text-white text-sm font-bold shadow-lg shadow-primary/20 transition-all disabled:opacity-50"
            >
              {saving ? (
                <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
              ) : (
                <span className="material-symbols-outlined text-[18px]">save</span>
              )}
              Save Settings
            </button>
            {saved && (
              <span className="flex items-center gap-1 text-emerald-400 text-sm">
                <span className="material-symbols-outlined text-[18px]">check_circle</span>
                Saved successfully
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
