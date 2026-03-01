package handlers

import (
	"log"
	"net/http"

	"github.com/w-bud/backend/jira"
	"github.com/w-bud/backend/storage"
)

type StoryHandler struct {
	Store *storage.Store
}

func (h *StoryHandler) List(w http.ResponseWriter, r *http.Request) {
	sf, err := h.Store.GetStories()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, sf)
}

func (h *StoryHandler) ListSprints(w http.ResponseWriter, r *http.Request) {
	cfg, err := h.Store.GetConfig()
	if err != nil {
		http.Error(w, "Failed to read config: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if cfg.JIRA.BaseURL == "" || cfg.JIRA.APIToken == "" || cfg.JIRA.BoardID == "" {
		http.Error(w, "JIRA is not configured", http.StatusBadRequest)
		return
	}
	client := jira.NewClient(cfg.JIRA)
	sprints, err := client.GetSprints(cfg.JIRA.BoardID)
	if err != nil {
		log.Printf("JIRA sprints fetch error: %v", err)
		http.Error(w, "Failed to fetch sprints: "+err.Error(), http.StatusBadGateway)
		return
	}
	writeJSON(w, sprints)
}

func (h *StoryHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	cfg, err := h.Store.GetConfig()
	if err != nil {
		http.Error(w, "Failed to read config: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Validate JIRA config is present
	if cfg.JIRA.BaseURL == "" || cfg.JIRA.APIToken == "" || cfg.JIRA.BoardID == "" {
		http.Error(w, "JIRA is not configured. Go to Settings to set your JIRA URL, API token, and Board ID.", http.StatusBadRequest)
		return
	}

	// Determine which sprint to fetch:
	// 1. Explicit query param from dropdown selection
	// 2. Previously cached sprint (stick with it until user changes)
	// 3. Config-level sprint ID override
	// 4. Auto-detect active sprint (fallback)
	sprintOverride := r.URL.Query().Get("sprint_id")
	if sprintOverride == "" {
		cached, _ := h.Store.GetStories()
		if cached.SprintID != "" {
			// Strip "SP-" prefix to get raw numeric ID
			sprintOverride = cached.SprintID[3:]
		}
	}
	if sprintOverride == "" {
		sprintOverride = cfg.JIRA.SprintID
	}

	client := jira.NewClient(cfg.JIRA)
	log.Printf("Refreshing stories from JIRA board %s (sprint override: %q)", cfg.JIRA.BoardID, sprintOverride)

	sf, err := client.FetchSprint(cfg.JIRA.BoardID, sprintOverride)
	if err != nil {
		log.Printf("JIRA fetch error: %v", err)
		http.Error(w, "JIRA fetch failed: "+err.Error(), http.StatusBadGateway)
		return
	}

	log.Printf("Fetched %d stories from sprint %s", len(sf.Stories), sf.SprintName)

	if err := h.Store.SaveStories(sf); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, sf)
}
