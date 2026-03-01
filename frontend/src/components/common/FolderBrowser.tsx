import { useEffect, useState } from 'react';
import { api } from '../../api/client';

interface DirEntry {
  name: string;
  path: string;
  is_git: boolean;
}

interface Props {
  onSelect: (path: string) => void;
  onCancel: () => void;
  initialPath?: string;
}

export default function FolderBrowser({ onSelect, onCancel, initialPath }: Props) {
  const [current, setCurrent] = useState('');
  const [parent, setParent] = useState('');
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [manualPath, setManualPath] = useState(initialPath || '');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    browse(initialPath);
  }, []);

  async function browse(path?: string) {
    setLoading(true);
    setError('');
    try {
      const res = await api.browse(path);
      setCurrent(res.current);
      setParent(res.parent);
      setEntries(res.entries || []);
      setManualPath(res.current);
    } catch (e: any) {
      // On error, show message but fallback to parent or home so user isn't stuck
      const msg = e.message || 'Failed to browse';
      setError(msg);
      if (path) {
        const fallback = path.replace(/\/[^/]+\/?$/, '') || '/';
        try {
          const res = await api.browse(fallback);
          setCurrent(res.current);
          setParent(res.parent);
          setEntries(res.entries || []);
          setManualPath(res.current);
        } catch {
          // If even fallback fails, go to root
          try {
            const res = await api.browse('/');
            setCurrent(res.current);
            setParent(res.parent);
            setEntries(res.entries || []);
            setManualPath(res.current);
          } catch { /* truly stuck */ }
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateFolder() {
    if (!newFolderName.trim() || !current) return;
    const fullPath = `${current}/${newFolderName.trim()}`;
    setCreating(true);
    try {
      await api.mkdir(fullPath);
      setNewFolderName('');
      setShowNewFolder(false);
      await browse(current); // refresh listing to show the new folder
    } catch (e: any) {
      setError(e.message || 'Failed to create folder');
    } finally {
      setCreating(false);
    }
  }

  function handleManualGo() {
    if (manualPath.trim()) {
      browse(manualPath.trim());
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-panel-dark border border-border-dark rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-dark">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">folder_open</span>
            <h3 className="text-white font-bold text-lg">Browse Folders</h3>
          </div>
          <button onClick={onCancel} className="p-1 text-text-secondary hover:text-white rounded hover:bg-surface-hover transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Path input bar */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border-dark bg-surface-dark">
          {parent && (
            <button
              onClick={() => browse(parent)}
              className="p-1.5 text-text-secondary hover:text-primary rounded hover:bg-primary/10 transition-colors shrink-0"
              title="Go up"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_upward</span>
            </button>
          )}
          <input
            className="flex-1 bg-bg-dark border border-border-dark rounded-md text-sm text-white px-3 py-1.5 font-mono focus:ring-1 focus:ring-primary focus:border-primary"
            value={manualPath}
            onChange={(e) => setManualPath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleManualGo()}
            placeholder="Enter path manually..."
          />
          <button
            onClick={handleManualGo}
            className="px-3 py-1.5 bg-surface-dark border border-border-dark rounded-md text-sm text-slate-300 hover:bg-surface-hover hover:text-white transition-colors shrink-0"
          >
            Go
          </button>
        </div>

        {/* Current path display */}
        <div className="px-5 py-2 text-xs text-text-secondary font-mono truncate">
          {current}
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 mx-5 mt-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs">
            <span className="material-symbols-outlined text-[16px]">error</span>
            <span className="flex-1 truncate">{error}</span>
            <button onClick={() => setError('')} className="text-red-400/60 hover:text-red-400 shrink-0">
              <span className="material-symbols-outlined text-[14px]">close</span>
            </button>
          </div>
        )}

        {/* Directory listing */}
        <div className="flex-1 overflow-y-auto px-2 pb-2 min-h-[200px]">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-text-secondary">
              <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
              Loading...
            </div>
          ) : entries.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-text-secondary text-sm">
              No subdirectories found
            </div>
          ) : (
            <div className="space-y-0.5">
              {entries.map((entry) => (
                <button
                  key={entry.path}
                  onClick={() => browse(entry.path)}
                  onDoubleClick={() => onSelect(entry.path)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors group ${
                    entry.is_git
                      ? 'hover:bg-primary/10 border border-transparent hover:border-primary/20'
                      : 'hover:bg-surface-hover'
                  }`}
                >
                  <span className={`material-symbols-outlined text-[20px] ${
                    entry.is_git ? 'text-primary' : 'text-text-secondary group-hover:text-slate-300'
                  }`}>
                    {entry.is_git ? 'source' : 'folder'}
                  </span>
                  <span className={`text-sm truncate ${
                    entry.is_git ? 'text-white font-medium' : 'text-slate-300'
                  }`}>
                    {entry.name}
                  </span>
                  {entry.is_git && (
                    <span className="ml-auto text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full font-medium shrink-0">
                      git repo
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* New folder inline */}
        {showNewFolder && (
          <div className="flex items-center gap-2 px-5 py-2.5 border-t border-border-dark bg-surface-dark/50">
            <span className="material-symbols-outlined text-[18px] text-primary shrink-0">create_new_folder</span>
            <input
              autoFocus
              className="flex-1 bg-bg-dark border border-border-dark rounded-md text-sm text-white px-3 py-1.5 font-mono focus:ring-1 focus:ring-primary focus:border-primary"
              placeholder="Folder name..."
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newFolderName.trim()) handleCreateFolder();
                if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName(''); }
              }}
            />
            <button
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim() || creating}
              className="px-3 py-1.5 bg-primary hover:bg-primary-dark rounded-md text-white text-sm font-bold transition-colors disabled:opacity-40 cursor-pointer"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button
              onClick={() => { setShowNewFolder(false); setNewFolderName(''); }}
              className="p-1 text-slate-500 hover:text-white transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border-dark bg-surface-dark rounded-b-xl">
          <button
            onClick={() => setShowNewFolder(!showNewFolder)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border-dark text-sm text-slate-300 hover:bg-surface-hover hover:text-white transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">create_new_folder</span>
            New Folder
          </button>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 border border-border-dark rounded-md text-sm text-slate-300 hover:bg-surface-hover transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={() => onSelect(current)}
              className="px-4 py-2 bg-primary hover:bg-primary-dark rounded-md text-white text-sm font-bold transition-colors cursor-pointer"
            >
              Select This Folder
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
