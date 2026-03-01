package models

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
	Name   string `json:"name"`
	Path   string `json:"path"`
	Prompt string `json:"prompt"`
}

type UpdateRepoRequest struct {
	Name   string `json:"name"`
	Path   string `json:"path"`
	Prompt string `json:"prompt"`
}

type ApproveRunRequest struct {
	PlanMD string `json:"plan_md"`
}
