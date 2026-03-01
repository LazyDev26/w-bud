package models

import "time"

type Config struct {
	JIRA           JIRAConfig     `json:"jira"`
	Webex          WebexConfig    `json:"webex"`
	Agents         AgentsConfig   `json:"agents"`
	GlobalPrompts  []GlobalPrompt `json:"global_prompts"`
	WorkspacesRoot string         `json:"workspaces_root"`
}

type GlobalPrompt struct {
	ID      string `json:"id"`
	Text    string `json:"text"`
	Tag     string `json:"tag"`
	Enabled bool   `json:"enabled"`
}

type AgentsConfig struct {
	PlanningAgent   string `json:"planning_agent"`
	ExecutionAgent  string `json:"execution_agent"`
	AutoApprovePlan bool   `json:"auto_approve_plan"`
}

type JIRAConfig struct {
	BaseURL  string `json:"base_url"`
	Email    string `json:"email"`
	APIToken string `json:"api_token"`
	BoardID  string `json:"board_id"`
	SprintID string `json:"sprint_id,omitempty"`
}

type WebexConfig struct {
	Token  string `json:"token"`
	RoomID string `json:"room_id"`
}

type Repo struct {
	ID            string    `json:"id"`
	Name          string    `json:"name"`
	Path          string    `json:"path"`
	Valid         bool      `json:"valid"`
	LastValidated time.Time `json:"last_validated"`
}

type ReposFile struct {
	Repos []Repo `json:"repos"`
}

type Story struct {
	ID                 string    `json:"id"`
	Summary            string    `json:"summary"`
	Description        string    `json:"description"`
	AcceptanceCriteria string    `json:"acceptance_criteria"`
	Status             string    `json:"status"`
	Priority           string    `json:"priority"`
	Points             int       `json:"points"`
	Components         []string  `json:"components"`
	Subtasks           []Subtask `json:"subtasks"`
}

type Subtask struct {
	ID      string `json:"id"`
	Summary string `json:"summary"`
	Status  string `json:"status"`
}

type StoriesFile struct {
	SprintID    string    `json:"sprint_id"`
	SprintName  string    `json:"sprint_name"`
	LastFetched time.Time `json:"last_fetched"`
	Stories     []Story   `json:"stories"`
}

type Run struct {
	RunID               string            `json:"run_id"`
	StoryID             string            `json:"story_id"`
	StorySummary        string            `json:"story_summary"`
	StoryIDs            []string          `json:"story_ids"`
	StorySummaries      []string          `json:"story_summaries"`
	BranchName          string            `json:"branch_name"`
	Status              string            `json:"status"` // pending, planning, awaiting_approval, executing, done, failed, aborted
	Repos               []string          `json:"repos"`
	Worktrees           map[string]string `json:"worktrees"`
	PlanMD              string            `json:"plan_md"`
	Context             string            `json:"context"`
	Constraints         string            `json:"constraints"`
	VerificationContext string            `json:"verification_context"`
	StartedAt           *time.Time        `json:"started_at"`
	CompletedAt         *time.Time        `json:"completed_at"`
	DurationSeconds     *float64          `json:"duration_seconds"`
	ChangedFiles        []string          `json:"changed_files"`
	Error               string            `json:"error"`
	PlanTokensIn        int               `json:"plan_tokens_in"`
	PlanTokensOut       int               `json:"plan_tokens_out"`
	ExecTokensIn        int               `json:"exec_tokens_in"`
	ExecTokensOut       int               `json:"exec_tokens_out"`
	LogPath             string            `json:"log_path"`
}

type RunsFile struct {
	Runs []Run `json:"runs"`
}

type LocksFile struct {
	Locks map[string]string `json:"locks"`
}

// API request/response types

type CreateRunRequest struct {
	StoryID             string   `json:"story_id"`
	StoryIDs            []string `json:"story_ids"`
	Repos               []string `json:"repos"`
	BranchName          string   `json:"branch_name"`
	Context             string   `json:"context"`
	Constraints         string   `json:"constraints"`
	VerificationContext string   `json:"verification_context"`
}

type CreateRepoRequest struct {
	Name string `json:"name"`
	Path string `json:"path"`
}

type UpdateRepoRequest struct {
	Name string `json:"name"`
	Path string `json:"path"`
}

type ApproveRunRequest struct {
	PlanMD string `json:"plan_md"`
}
