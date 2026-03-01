const BASE = '';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  // Stories
  getStories: () => request<import('../types').StoriesFile>('/api/stories'),
  getSprints: () => request<{ id: number; name: string; state: string }[]>('/api/stories/sprints'),
  refreshStories: (sprintId?: string) =>
    request<import('../types').StoriesFile>(`/api/stories/refresh${sprintId ? `?sprint_id=${encodeURIComponent(sprintId)}` : ''}`),

  // Repos
  getRepos: () => request<import('../types').Repo[]>('/api/repos'),
  createRepo: (data: { name: string; path: string; prompt?: string }) =>
    request<import('../types').Repo>('/api/repos', { method: 'POST', body: JSON.stringify(data) }),
  updateRepo: (id: string, data: { name: string; path: string; prompt?: string }) =>
    request<import('../types').Repo>(`/api/repos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRepo: (id: string) =>
    request<void>(`/api/repos/${id}`, { method: 'DELETE' }),
  validateRepo: (id: string) =>
    request<import('../types').Repo>(`/api/repos/${id}/validate`, { method: 'POST' }),

  // Runs
  getRuns: () => request<import('../types').Run[]>('/api/runs'),
  getRun: (runId: string) => request<import('../types').Run>(`/api/runs/${runId}`),
  createRun: (data: import('../types').CreateRunRequest) =>
    request<import('../types').Run>('/api/runs', { method: 'POST', body: JSON.stringify(data) }),
  approveRun: (runId: string, planMd?: string) =>
    request<import('../types').Run>(`/api/runs/${runId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ plan_md: planMd || '' }),
    }),
  abortRun: (runId: string) =>
    request<import('../types').Run>(`/api/runs/${runId}/abort`, { method: 'POST' }),
  previewPrompt: (data: import('../types').CreateRunRequest) =>
    request<{ prompt: string }>('/api/runs/preview-prompt', { method: 'POST', body: JSON.stringify(data) }),
  getRunLogs: (runId: string) =>
    request<{ run_id: string; lines: string[] }>(`/api/runs/${runId}/logs`),
  getRunDiff: (runId: string, file?: string) =>
    request<{ run_id: string; diffs: { file: string; diff: string }[] }>(
      `/api/runs/${runId}/diff${file ? `?file=${encodeURIComponent(file)}` : ''}`
    ),

  // Browse filesystem
  browse: (path?: string) =>
    request<{ current: string; parent: string; entries: { name: string; path: string; is_git: boolean }[] }>(
      `/api/browse${path ? `?path=${encodeURIComponent(path)}` : ''}`
    ),

  // Create directory
  mkdir: (path: string) =>
    request<{ path: string }>('/api/browse/mkdir', { method: 'POST', body: JSON.stringify({ path }) }),

  // Config
  getConfig: () => request<import('../types').AppConfig>('/api/config'),
  updateConfig: (data: import('../types').AppConfig) =>
    request<import('../types').AppConfig>('/api/config', { method: 'PUT', body: JSON.stringify(data) }),
  checkAgent: (agent: string) =>
    request<{ agent: string; available: boolean; version?: string; error?: string }>(
      `/api/config/check-agent?agent=${encodeURIComponent(agent)}`
    ),
};
