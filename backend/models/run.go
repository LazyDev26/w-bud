package models

import "time"

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
	ExecMD              string            `json:"exec_md"`
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
