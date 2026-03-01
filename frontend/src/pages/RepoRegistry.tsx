import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Repo } from '../types';
import Breadcrumbs from '../components/common/Breadcrumbs';
import FolderBrowser from '../components/common/FolderBrowser';

export default function RepoRegistry() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [filter, setFilter] = useState('');
  const [showBrowser, setShowBrowser] = useState(false);

  useEffect(() => {
    loadRepos();
  }, []);

  async function loadRepos() {
    try {
      const r = await api.getRepos();
      setRepos(r);
    } catch (e) {
      console.error('Failed to load repos:', e);
    }
  }

  async function handleAdd() {
    if (!name || !path) return;
    await api.createRepo({ name, path });
    setName('');
    setPath('');
    setShowAdd(false);
    loadRepos();
  }

  async function handleUpdate(id: string) {
    await api.updateRepo(id, { name, path });
    setEditId(null);
    setName('');
    setPath('');
    loadRepos();
  }

  async function handleDelete(id: string) {
    await api.deleteRepo(id);
    loadRepos();
  }

  async function handleValidate(id: string) {
    await api.validateRepo(id);
    loadRepos();
  }

  function startEdit(repo: Repo) {
    setEditId(repo.id);
    setName(repo.name);
    setPath(repo.path);
  }

  const validCount = repos.filter((r) => r.valid).length;
  const invalidCount = repos.filter((r) => !r.valid).length;
  const filtered = repos.filter(
    (r) => !filter || r.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <>
    {showBrowser && (
      <FolderBrowser
        initialPath={path || undefined}
        onSelect={(selected) => {
          setPath(selected);
          setShowBrowser(false);
        }}
        onCancel={() => setShowBrowser(false)}
      />
    )}
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex flex-col gap-6 p-8 pb-0">
        <Breadcrumbs items={[
          { label: 'Home', to: '/' },
          { label: 'Settings' },
          { label: 'Repository Registry' },
        ]} />
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white">Repository Registry</h1>
            <p className="text-text-secondary text-base max-w-2xl">
              Manage and validate your local git repositories. Only valid repos appear as selectable in story configuration.
            </p>
          </div>
          <button
            onClick={() => { setShowAdd(true); setEditId(null); setName(''); setPath(''); }}
            className="flex items-center gap-2 bg-primary hover:bg-blue-600 text-white font-bold py-2.5 px-5 rounded-lg transition-colors shadow-lg shadow-primary/20"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            Add New Repo
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-panel-dark border border-border-dark p-4 rounded-lg flex items-center gap-4">
            <div className="bg-green-500/10 p-3 rounded-lg flex items-center justify-center">
              <span className="material-symbols-outlined text-green-500">check_circle</span>
            </div>
            <div>
              <p className="text-sm text-text-secondary font-medium">Active Repositories</p>
              <p className="text-2xl font-bold text-white">{validCount}</p>
            </div>
          </div>
          {invalidCount > 0 && (
            <div className="bg-panel-dark border border-border-dark p-4 rounded-lg flex items-center gap-4">
              <div className="bg-red-500/10 p-3 rounded-lg flex items-center justify-center">
                <span className="material-symbols-outlined text-red-500">error</span>
              </div>
              <div>
                <p className="text-sm text-text-secondary font-medium">Invalid Paths</p>
                <p className="text-2xl font-bold text-white">{invalidCount}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto p-8 pt-6">
        {/* Add/Edit Form */}
        {(showAdd || editId) && (
          <div className="mb-6 bg-panel-dark border border-border-dark rounded-lg p-6">
            <h3 className="text-sm font-bold text-white mb-4">{editId ? 'Edit Repository' : 'Add New Repository'}</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs text-text-secondary mb-1">Name</label>
                <input
                  className="w-full bg-bg-dark border border-border-dark rounded-md text-sm text-white px-3 py-2 focus:ring-1 focus:ring-primary focus:border-primary"
                  placeholder="e.g. user-service"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Local Path</label>
                <div className="flex gap-2">
                  <input
                    className="flex-1 bg-bg-dark border border-border-dark rounded-md text-sm text-white px-3 py-2 focus:ring-1 focus:ring-primary focus:border-primary font-mono"
                    placeholder="e.g. /Users/dev/user-service"
                    value={path}
                    onChange={(e) => setPath(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowBrowser(true)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-surface-dark border border-border-dark rounded-md text-sm text-slate-300 hover:bg-surface-hover hover:text-white transition-colors shrink-0"
                    title="Browse folders"
                  >
                    <span className="material-symbols-outlined text-[18px]">folder_open</span>
                    Browse
                  </button>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => editId ? handleUpdate(editId) : handleAdd()}
                className="px-4 py-2 bg-primary hover:bg-primary-dark rounded-md text-white text-sm font-bold transition-colors"
              >
                {editId ? 'Update' : 'Save'}
              </button>
              <button
                onClick={() => { setShowAdd(false); setEditId(null); }}
                className="px-4 py-2 border border-border-dark rounded-md text-sm text-slate-300 hover:bg-surface-hover transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="border border-border-dark rounded-lg overflow-hidden bg-panel-dark shadow-sm">
          {/* Toolbar */}
          <div className="flex items-center justify-between p-4 border-b border-border-dark bg-surface-dark">
            <div className="relative max-w-xs w-full">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">search</span>
              <input
                className="w-full pl-10 pr-4 py-2 bg-bg-dark border border-border-dark rounded-lg text-sm text-white placeholder-slate-400 focus:ring-1 focus:ring-primary focus:border-primary"
                placeholder="Filter repositories..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
            <button
              onClick={() => repos.forEach((r) => handleValidate(r.id))}
              className="p-2 text-text-secondary hover:text-white rounded-lg hover:bg-surface-hover transition-colors"
              title="Refresh Status"
            >
              <span className="material-symbols-outlined">refresh</span>
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-dark border-b border-border-dark">
                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-text-secondary w-1/4">Repository Name</th>
                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-text-secondary w-1/3">Local Path</th>
                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-text-secondary w-1/6">Status</th>
                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-text-secondary w-1/6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-dark">
                {filtered.map((repo) => (
                  <tr key={repo.id} className="group hover:bg-surface-hover transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center text-primary">
                          <span className="material-symbols-outlined text-[18px]">terminal</span>
                        </div>
                        <span className="text-sm font-bold text-white group-hover:text-primary transition-colors">
                          {repo.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <code className={`font-mono text-xs px-2 py-1 rounded border ${
                        repo.valid
                          ? 'bg-surface-dark text-slate-300 border-border-dark'
                          : 'bg-red-900/10 text-red-400 border-red-900/30 line-through'
                      }`}>
                        {repo.path}
                      </code>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                        repo.valid
                          ? 'bg-green-900/30 text-green-400 border-green-800/50'
                          : 'bg-red-900/30 text-red-400 border-red-800/50'
                      }`}>
                        <span className="material-symbols-outlined text-[14px] mr-1">
                          {repo.valid ? 'check_circle' : 'cancel'}
                        </span>
                        {repo.valid ? 'Valid' : 'Invalid Path'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleValidate(repo.id)}
                          className="p-1.5 text-text-secondary hover:text-primary rounded hover:bg-primary/10 transition-colors"
                          title="Re-validate"
                        >
                          <span className="material-symbols-outlined text-[20px]">refresh</span>
                        </button>
                        <button
                          onClick={() => startEdit(repo)}
                          className="p-1.5 text-text-secondary hover:text-primary rounded hover:bg-primary/10 transition-colors"
                          title="Edit"
                        >
                          <span className="material-symbols-outlined text-[20px]">edit</span>
                        </button>
                        <button
                          onClick={() => handleDelete(repo.id)}
                          className="p-1.5 text-text-secondary hover:text-red-400 rounded hover:bg-red-500/10 transition-colors"
                          title="Remove"
                        >
                          <span className="material-symbols-outlined text-[20px]">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-text-secondary">
                      {repos.length === 0 ? 'No repositories registered yet.' : 'No matches found.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between p-4 border-t border-border-dark bg-surface-dark">
            <p className="text-xs text-text-secondary">
              Showing {filtered.length} of {repos.length} repositories
            </p>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
