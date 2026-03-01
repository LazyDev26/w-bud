export interface Story {
  id: string;
  summary: string;
  description: string;
  acceptance_criteria: string;
  status: string;
  priority: string;
  points: number;
  components: string[];
  subtasks: Subtask[];
}

export interface Subtask {
  id: string;
  summary: string;
  status: string;
}

export interface StoriesFile {
  sprint_id: string;
  sprint_name: string;
  last_fetched: string;
  stories: Story[];
}

export interface Repo {
  id: string;
  name: string;
  path: string;
  prompt?: string;
  valid: boolean;
  last_validated: string;
}

export interface Run {
  run_id: string;
  story_id: string;
  story_summary: string;
  story_ids: string[];
  story_summaries: string[];
  branch_name: string;
  status: 'pending' | 'planning' | 'awaiting_approval' | 'executing' | 'done' | 'failed' | 'aborted';
  repos: string[];
  worktrees: Record<string, string>;
  plan_md: string;
  context: string;
  constraints: string;
  verification_context: string;
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  changed_files: string[];
  error: string;
  plan_tokens_in: number;
  plan_tokens_out: number;
  exec_tokens_in: number;
  exec_tokens_out: number;
  log_path: string;
}

export interface CreateRunRequest {
  story_id: string;
  story_ids?: string[];
  repos: string[];
  branch_name: string;
  context: string;
  constraints: string;
  verification_context: string;
}

export interface JIRAConfig {
  base_url: string;
  email: string;
  api_token: string;
  board_id: string;
  sprint_id?: string;
}

export interface WebexConfig {
  token: string;
  room_id: string;
}

export interface AgentsConfig {
  planning_agent: string;
  execution_agent: string;
  auto_approve_plan: boolean;
}

export interface GlobalPrompt {
  id: string;
  text: string;
  tag: 'planning' | 'execution' | 'both';
  enabled: boolean;
}

export interface AppConfig {
  jira: JIRAConfig;
  webex: WebexConfig;
  agents: AgentsConfig;
  global_prompts: GlobalPrompt[];
  workspaces_root: string;
}
