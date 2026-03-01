package models

import "time"

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
