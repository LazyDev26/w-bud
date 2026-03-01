import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Story, Repo, AppConfig } from '../types';
import Breadcrumbs from '../components/common/Breadcrumbs';
import FolderBrowser from '../components/common/FolderBrowser';

export default function StoryContext() {
  const { storyId } = useParams<{ storyId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [stories, setStories] = useState<Story[]>([]);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);
  const [branchName, setBranchName] = useState('');
  const [context, setContext] = useState('');
  const [promptPreview, setPromptPreview] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [constraints, setConstraints] = useState('');
  const [verification, setVerification] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [listeningField, setListeningField] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const baseTextRef = useRef<string>('');
  const [showAddRepo, setShowAddRepo] = useState(false);
  const [newRepoName, setNewRepoName] = useState('');
  const [newRepoPath, setNewRepoPath] = useState('');
  const [showRepoBrowse, setShowRepoBrowse] = useState(false);
  const [addingRepo, setAddingRepo] = useState(false);
  const [addRepoError, setAddRepoError] = useState('');
  const [config, setConfig] = useState<AppConfig | null>(null);

  // Resolve story IDs from route param or query param
  const storyIds: string[] = storyId
    ? [storyId]
    : (searchParams.get('stories') || '').split(',').filter(Boolean);

  useEffect(() => {
    loadData();
  }, [storyId, searchParams.get('stories')]);

  async function loadData() {
    try {
      const [sf, repoList, cfg] = await Promise.all([api.getStories(), api.getRepos(), api.getConfig()]);
      setConfig(cfg);
      const found = sf.stories.filter((s) => storyIds.includes(s.id));
      setStories(found);
      setRepos(repoList.filter((r) => r.valid));
      if (found.length > 0) {
        const allComponents = found.flatMap((s) => s.components || []);
        const uniqueComponents = [...new Set(allComponents)];
        const matching = repoList
          .filter((r) => r.valid && uniqueComponents.includes(r.name))
          .map((r) => r.name);
        setSelectedRepos(matching);
      }
    } catch (e) {
      console.error('Failed to load story data:', e);
    }
  }

  function toggleRepo(name: string) {
    setSelectedRepos((prev) =>
      prev.includes(name) ? prev.filter((r) => r !== name) : [...prev, name]
    );
  }

  async function handleAddRepo() {
    if (!newRepoName.trim() || !newRepoPath.trim()) return;
    setAddingRepo(true);
    setAddRepoError('');
    try {
      const repo = await api.createRepo({ name: newRepoName.trim(), path: newRepoPath.trim() });
      await api.validateRepo(repo.id);
      const repoList = await api.getRepos();
      setRepos(repoList.filter((r) => r.valid));
      setSelectedRepos((prev) => [...prev, newRepoName.trim()]);
      setNewRepoName('');
      setNewRepoPath('');
      setShowAddRepo(false);
    } catch (e: any) {
      setAddRepoError(e.message || 'Failed to add repo');
    } finally {
      setAddingRepo(false);
    }
  }

  const primaryStory = stories[0] || null;

  async function handlePreview() {
    if (stories.length === 0 || selectedRepos.length === 0) return;
    setLoadingPreview(true);
    try {
      const ids = stories.map((s) => s.id);
      const res = await api.previewPrompt({
        story_id: ids[0],
        story_ids: ids,
        repos: selectedRepos,
        branch_name: branchName || `feature/${ids[0]}`,
        context,
        constraints,
        verification_context: verification,
      });
      setPromptPreview(res.prompt);
    } catch (e) {
      console.error('Failed to preview prompt:', e);
    }
    setLoadingPreview(false);
  }

  async function handleGenerate() {
    if (stories.length === 0 || selectedRepos.length === 0) return;
    setSubmitting(true);
    try {
      const ids = stories.map((s) => s.id);
      const run = await api.createRun({
        story_id: ids[0],
        story_ids: ids,
        repos: selectedRepos,
        branch_name: branchName || `feature/${ids[0]}`,
        context,
        constraints,
        verification_context: verification,
      });
      navigate(`/run/${run.run_id}`);
    } catch (e) {
      console.error('Failed to create run:', e);
      setSubmitting(false);
    }
  }

  function toggleSpeech(field: string, setter: React.Dispatch<React.SetStateAction<string>>) {
    if (listeningField === field) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setListeningField(null);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition not supported in this browser');
      return;
    }

    // Stop any existing recognition
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    // Snapshot the current text so we can append only new speech to it
    const currentText = field === 'context' ? context : field === 'constraints' ? constraints : verification;
    baseTextRef.current = currentText;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }
      // Build full text: base + finalized speech + current interim preview
      const combined = (baseTextRef.current + (baseTextRef.current ? ' ' : '') + finalTranscript + interimTranscript).trimStart();
      setter(combined);

      // Once a segment is finalized, update the base so it won't be re-added
      if (finalTranscript) {
        baseTextRef.current = (baseTextRef.current + (baseTextRef.current ? ' ' : '') + finalTranscript).trimStart();
      }
    };

    recognition.onerror = () => {
      recognitionRef.current = null;
      setListeningField(null);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListeningField(null);
    };

    recognition.start();
    recognitionRef.current = recognition;
    setListeningField(field);
  }

  if (stories.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-secondary">
        <span className="material-symbols-outlined animate-spin text-4xl">progress_activity</span>
      </div>
    );
  }

  return (
    <>
    {showRepoBrowse && (
      <FolderBrowser
        onSelect={(selected) => {
          setNewRepoPath(selected);
          if (!newRepoName) {
            const folderName = selected.split('/').pop() || '';
            setNewRepoName(folderName);
          }
          setShowRepoBrowse(false);
        }}
        onCancel={() => setShowRepoBrowse(false)}
      />
    )}
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Breadcrumb Bar */}
      <div className="flex items-center gap-4 border-b border-border-dark bg-panel-dark px-6 py-3 shrink-0">
        <Breadcrumbs items={[
          { label: 'Sprint Board', to: '/' },
          { label: stories.length === 1 ? stories[0].id : `${stories.length} Stories` },
          { label: 'Context & Setup' },
        ]} />
      </div>

      <div className="flex flex-1 overflow-hidden">
      {/* Left: Story Details */}
      <section className="flex-1 min-w-[400px] flex flex-col border-r border-border-dark overflow-hidden">
        <div className="flex-1 overflow-y-auto p-8">
          {stories.length > 1 && (
            <div className="flex items-center gap-2 mb-6">
              <span className="material-symbols-outlined text-primary text-[20px]">checklist</span>
              <span className="text-white text-lg font-bold">{stories.length} Stories Selected</span>
            </div>
          )}
          {stories.map((story, idx) => (
            <div key={story.id} className={stories.length > 1 ? 'mb-6 p-5 bg-surface-dark/30 border border-border-dark rounded-xl' : ''}>
              {/* Story Header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-blue-900/30 text-blue-400 px-2 py-1 rounded text-xs font-bold uppercase tracking-wider border border-blue-800/50">
                  {stories.length > 1 ? `Story ${idx + 1}` : 'Story'}
                </div>
                <span className="text-text-secondary font-mono text-sm">{story.id}</span>
              </div>

              <h2 className={`text-white font-bold leading-tight mb-6 ${stories.length === 1 ? 'text-3xl' : 'text-xl'}`}>{story.summary}</h2>

              {/* Metadata */}
              <div className="grid grid-cols-3 gap-4 mb-6 bg-surface-dark border border-border-dark rounded-lg p-4">
                <div className="flex flex-col gap-1">
                  <span className="text-text-secondary text-xs uppercase font-medium tracking-wide">Story Points</span>
                  <span className="text-sm font-medium bg-border-dark w-fit px-2 rounded text-white">{story.points}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-text-secondary text-xs uppercase font-medium tracking-wide">Priority</span>
                  <span className="text-sm font-medium text-white">{story.priority}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-text-secondary text-xs uppercase font-medium tracking-wide">Status</span>
                  <span className="text-sm font-medium text-white">{story.status}</span>
                </div>
              </div>

              {/* Description */}
              {story.description && (
                <div className="mb-6">
                  <h3 className="text-white text-sm font-bold uppercase tracking-wide mb-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-text-secondary">description</span>
                    Description
                  </h3>
                  <div className="bg-surface-dark border border-border-dark rounded-lg p-4 text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {story.description}
                  </div>
                </div>
              )}

              {/* Acceptance Criteria */}
              {story.acceptance_criteria && (
                <div className="mb-6">
                  <h3 className="text-white text-sm font-bold uppercase tracking-wide mb-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-text-secondary">task_alt</span>
                    Acceptance Criteria
                  </h3>
                  <div className="bg-surface-dark border border-border-dark rounded-lg p-4 text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {story.acceptance_criteria}
                  </div>
                </div>
              )}

              {/* Components */}
              {(story.components || []).length > 0 && (
                <div className="mb-6">
                  <h3 className="text-white text-sm font-bold uppercase tracking-wide mb-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-text-secondary">dns</span>
                    Components
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {(story.components || []).map((c) => (
                      <span key={c} className="bg-surface-dark border border-border-dark px-3 py-1 rounded text-xs font-mono text-slate-300">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Subtasks */}
              {(story.subtasks || []).length > 0 && (
                <div className="mb-6">
                  <h3 className="text-white text-sm font-bold uppercase tracking-wide mb-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-text-secondary">checklist</span>
                    Subtasks
                  </h3>
                  <div className="flex flex-col gap-2">
                    {(story.subtasks || []).map((st) => (
                      <div
                        key={st.id}
                        className="flex items-start gap-3 p-3 rounded bg-surface-dark/50 border border-border-dark/50"
                      >
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-slate-200">{st.summary}</span>
                          <span className="text-xs text-text-secondary font-mono mt-0.5">{st.id}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Right: Configuration Panel */}
      <section className="w-[500px] flex-none flex flex-col bg-panel-dark border-l border-border-dark shadow-2xl z-10">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-dark bg-[#141d26]">
          <h2 className="text-white text-lg font-bold flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">tune</span>
            Plan Configuration
          </h2>
          <div className={`text-xs font-mono px-2 py-1 rounded ${config?.agents?.planning_agent ? 'text-text-secondary bg-border-dark' : 'text-amber-400 bg-amber-500/10 border border-amber-500/20'}`}>
            {config?.agents?.planning_agent === 'codex' ? 'Codex CLI' : config?.agents?.planning_agent === 'copilot' ? 'Copilot CLI' : config?.agents?.planning_agent === 'cursor' ? 'Cursor CLI' : 'No Agent'}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Agent config warning */}
          {config && (!config.agents?.planning_agent || !config.agents?.execution_agent) && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex items-start gap-2.5">
              <span className="material-symbols-outlined text-amber-400 text-[18px] mt-0.5 shrink-0">warning</span>
              <div className="text-xs text-amber-300 space-y-1">
                {!config.agents?.planning_agent && <p><strong>Planning agent</strong> is not configured.</p>}
                {!config.agents?.execution_agent && <p><strong>Execution agent</strong> is not configured.</p>}
                <p className="text-amber-400/70">Go to <Link to="/settings" className="text-primary hover:underline font-bold">Settings → Agents</Link> to select an agent before running.</p>
              </div>
            </div>
          )}
          {/* Repo Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-slate-300">Target Repositories</label>
              <button
                onClick={() => setShowAddRepo(!showAddRepo)}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-primary transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">add_circle</span>
                Add Repo
              </button>
            </div>
            <div className="min-h-[42px] w-full bg-bg-dark border border-border-dark rounded-md p-1.5 flex flex-wrap gap-2">
              {repos.map((repo) => (
                <button
                  key={repo.id}
                  onClick={() => toggleRepo(repo.name)}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-mono transition-colors cursor-pointer ${
                    selectedRepos.includes(repo.name)
                      ? 'bg-primary/20 text-primary border border-primary/30'
                      : 'bg-surface-dark text-slate-400 border border-border-dark hover:text-slate-200'
                  }`}
                >
                  <span>{repo.name}</span>
                  {selectedRepos.includes(repo.name) && (
                    <span className="material-symbols-outlined text-[14px]">check</span>
                  )}
                </button>
              ))}
              {repos.length === 0 && !showAddRepo && (
                <button
                  onClick={() => setShowAddRepo(true)}
                  className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-primary p-1 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">add_circle</span>
                  No repos registered — click to add one
                </button>
              )}
            </div>

            {/* Inline Add Repo Form */}
            {showAddRepo && (
              <div className="bg-surface-dark/50 border border-border-dark rounded-lg p-3 space-y-2.5">
                <div>
                  <label className="block text-[11px] text-text-secondary mb-1 font-medium uppercase tracking-wider">Name</label>
                  <input
                    autoFocus
                    className="w-full bg-bg-dark border border-border-dark rounded-md text-sm text-white px-3 py-1.5 font-mono focus:ring-1 focus:ring-primary focus:border-primary"
                    placeholder="e.g. my-service"
                    value={newRepoName}
                    onChange={(e) => setNewRepoName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-text-secondary mb-1 font-medium uppercase tracking-wider">Local Path</label>
                  <div className="flex gap-1.5">
                    <input
                      className="flex-1 bg-bg-dark border border-border-dark rounded-md text-sm text-white px-3 py-1.5 font-mono focus:ring-1 focus:ring-primary focus:border-primary"
                      placeholder="/Users/you/code/my-service"
                      value={newRepoPath}
                      onChange={(e) => setNewRepoPath(e.target.value)}
                    />
                    <button
                      onClick={() => setShowRepoBrowse(true)}
                      className="px-2 py-1.5 bg-bg-dark border border-border-dark rounded-md text-slate-400 hover:text-white transition-colors cursor-pointer"
                      title="Browse"
                    >
                      <span className="material-symbols-outlined text-[18px]">folder_open</span>
                    </button>
                  </div>
                </div>
                {addRepoError && (
                  <p className="text-xs text-red-400">{addRepoError}</p>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleAddRepo}
                    disabled={!newRepoName.trim() || !newRepoPath.trim() || addingRepo}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary-dark rounded-md text-white text-xs font-bold transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    {addingRepo ? (
                      <span className="material-symbols-outlined animate-spin text-[14px]">progress_activity</span>
                    ) : (
                      <span className="material-symbols-outlined text-[14px]">add</span>
                    )}
                    {addingRepo ? 'Adding...' : 'Add Repository'}
                  </button>
                  <button
                    onClick={() => { setShowAddRepo(false); setNewRepoName(''); setNewRepoPath(''); setAddRepoError(''); }}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <hr className="border-border-dark/50" />

          {/* Branch Name */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-slate-300">Branch Name</label>
              <span className="text-xs text-text-secondary">Auto-generated if empty</span>
            </div>
            <div className="flex items-center bg-bg-dark border border-border-dark rounded-md focus-within:ring-1 focus-within:ring-primary focus-within:border-primary">
              <span className="pl-3 text-slate-500 text-sm font-mono shrink-0 select-none">feature/{primaryStory?.id || 'STORY'}-</span>
              <input
                type="text"
                className="flex-1 bg-transparent text-sm text-slate-200 py-2 pr-3 pl-0 focus:outline-none placeholder-text-secondary/30 font-mono"
                placeholder="my-feature"
                value={branchName.replace(/^feature\//, '').replace(new RegExp(`^${primaryStory?.id}-?`, 'i'), '')}
                onChange={(e) => setBranchName(`feature/${primaryStory?.id}-${e.target.value.replace(/\s+/g, '-').toLowerCase()}`)}
              />
            </div>
          </div>

          <hr className="border-border-dark/50" />

          {/* Additional Context */}
          <TextAreaField
            label="Additional Context"
            badge="Optional"
            placeholder="e.g. Use the new v3 API pattern as described in RFC-102..."
            value={context}
            onChange={setContext}
            isListening={listeningField === 'context'}
            onToggleSpeech={() => toggleSpeech('context', setContext)}
          />

          {/* Constraints */}
          <TextAreaField
            label="Constraints"
            badge="Strict"
            placeholder="e.g. Do not modify the existing User model, extend it instead..."
            value={constraints}
            onChange={setConstraints}
            isListening={listeningField === 'constraints'}
            onToggleSpeech={() => toggleSpeech('constraints', setConstraints)}
          />

          {/* Verification Context */}
          <TextAreaField
            label="Verification Criteria"
            badge="QA Focus"
            placeholder="e.g. Ensure unit tests cover the token expiration edge case..."
            value={verification}
            onChange={setVerification}
            isListening={listeningField === 'verification'}
            onToggleSpeech={() => toggleSpeech('verification', setVerification)}
          />
        </div>

        {/* Footer */}
        <div className="flex-none p-6 border-t border-border-dark bg-[#141d26]">
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/')}
              className="flex-1 py-2.5 px-4 bg-transparent border border-border-dark rounded-md text-sm font-bold text-slate-300 hover:bg-bg-dark hover:text-white hover:border-text-secondary transition-all"
            >
              Back
            </button>
            <button
              onClick={handlePreview}
              disabled={loadingPreview || selectedRepos.length === 0}
              className="flex-1 py-2.5 px-4 bg-transparent border border-primary/50 rounded-md text-primary text-sm font-bold hover:bg-primary/10 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[20px]">visibility</span>
              {loadingPreview ? 'Loading...' : 'Preview Prompt'}
            </button>
            <button
              onClick={handleGenerate}
              disabled={submitting || selectedRepos.length === 0 || !config?.agents?.planning_agent}
              className="flex-[2] py-2.5 px-4 bg-primary hover:bg-primary-dark rounded-md text-white text-sm font-bold shadow-lg shadow-primary/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[20px]">smart_toy</span>
              {submitting ? 'Starting...' : !config?.agents?.planning_agent ? 'No Agent Configured' : 'Generate Plan'}
            </button>
          </div>
        </div>
      </section>
      </div>
    </div>

    {/* Prompt Preview Modal */}
    {promptPreview !== null && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setPromptPreview(null)}>
        <div className="bg-surface-dark border border-border-dark rounded-xl w-[90%] max-w-3xl max-h-[80vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-border-dark">
            <h3 className="text-sm font-bold text-white uppercase flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-primary">visibility</span>
              Planning Prompt Preview
            </h3>
            <button onClick={() => setPromptPreview(null)} className="text-text-secondary hover:text-white transition-colors">
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            <pre className="text-sm font-mono text-slate-300 whitespace-pre-wrap leading-relaxed">{promptPreview}</pre>
          </div>
          <div className="flex gap-3 px-5 py-4 border-t border-border-dark">
            <button onClick={() => setPromptPreview(null)} className="flex-1 py-2 px-4 bg-transparent border border-border-dark rounded-md text-sm text-slate-300 hover:bg-bg-dark transition-all">
              Close
            </button>
            <button
              onClick={() => { setPromptPreview(null); handleGenerate(); }}
              disabled={submitting}
              className="flex-[2] py-2 px-4 bg-primary hover:bg-primary-dark rounded-md text-white text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">smart_toy</span>
              Looks Good — Generate Plan
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

function TextAreaField({
  label,
  badge,
  placeholder,
  value,
  onChange,
  isListening,
  onToggleSpeech,
}: {
  label: string;
  badge: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  isListening: boolean;
  onToggleSpeech: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <label className={`block text-sm font-medium ${isListening ? 'text-primary' : 'text-slate-300'}`}>
          {label}
        </label>
        {isListening ? (
          <span className="text-xs text-primary animate-pulse font-mono">Listening...</span>
        ) : (
          <span className="text-xs text-text-secondary">{badge}</span>
        )}
      </div>
      <div className="relative">
        <textarea
          className={`w-full h-24 bg-bg-dark border ${
            isListening ? 'border-primary shadow-[0_0_15px_-3px_rgba(19,127,236,0.15)]' : 'border-border-dark'
          } rounded-md text-sm text-slate-200 p-3 pr-12 focus:ring-1 focus:ring-primary focus:border-primary resize-none placeholder-text-secondary/30`}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          onClick={onToggleSpeech}
          className={`absolute top-2 right-2 p-1.5 rounded-md transition-colors ${
            isListening
              ? 'bg-red-500 text-white hover:bg-red-600 animate-pulse'
              : 'text-text-secondary hover:text-primary hover:bg-primary/10'
          }`}
          title="Speech to text"
        >
          <span className="material-symbols-outlined text-[18px]">{isListening ? 'stop' : 'mic'}</span>
        </button>
        {isListening && (
          <div className="absolute right-3 top-12 flex items-end justify-center gap-0.5 h-4">
            <div className="wave-bar h-2"></div>
            <div className="wave-bar h-4"></div>
            <div className="wave-bar h-3"></div>
            <div className="wave-bar h-2"></div>
            <div className="wave-bar h-3"></div>
          </div>
        )}
      </div>
    </div>
  );
}
