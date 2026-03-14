package models

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
	AutoPush        bool   `json:"auto_push"`
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
