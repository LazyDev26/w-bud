package models

import "time"

type Repo struct {
	ID            string    `json:"id"`
	Name          string    `json:"name"`
	Path          string    `json:"path"`
	Prompt        string    `json:"prompt,omitempty"`
	Valid         bool      `json:"valid"`
	LastValidated time.Time `json:"last_validated"`
}

type ReposFile struct {
	Repos []Repo `json:"repos"`
}
