package handlers

import (
	"encoding/json"
	"net/http"
	"os/exec"
	"strings"

	"github.com/w-bud/backend/models"
	"github.com/w-bud/backend/storage"
)

type ConfigHandler struct {
	Store *storage.Store
}

func (h *ConfigHandler) Get(w http.ResponseWriter, r *http.Request) {
	cfg, err := h.Store.GetConfig()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	// Mask the API token in responses
	if cfg.JIRA.APIToken != "" {
		cfg.JIRA.APIToken = "••••••••"
	}
	writeJSON(w, cfg)
}

func (h *ConfigHandler) Update(w http.ResponseWriter, r *http.Request) {
	var incoming models.Config
	if err := json.NewDecoder(r.Body).Decode(&incoming); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// If token is masked, keep the existing one
	existing, err := h.Store.GetConfig()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if incoming.JIRA.APIToken == "••••••••" || incoming.JIRA.APIToken == "" {
		incoming.JIRA.APIToken = existing.JIRA.APIToken
	}
	if incoming.Webex.Token == "••••••••" || incoming.Webex.Token == "" {
		incoming.Webex.Token = existing.Webex.Token
	}

	if err := h.Store.SaveConfig(incoming); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Mask token in response
	if incoming.JIRA.APIToken != "" {
		incoming.JIRA.APIToken = "••••••••"
	}
	writeJSON(w, incoming)
}

// CheckAgent verifies an agent CLI is installed by running its version command.
func (h *ConfigHandler) CheckAgent(w http.ResponseWriter, r *http.Request) {
	agent := r.URL.Query().Get("agent")
	if agent == "" {
		http.Error(w, "agent query param required", http.StatusBadRequest)
		return
	}

	var cmd *exec.Cmd
	switch agent {
	case "codex":
		cmd = exec.Command("codex", "--version")
	case "cursor":
		cmd = exec.Command("agent", "--version")
	case "copilot":
		cmd = exec.Command("copilot", "--version")
	default:
		writeJSON(w, map[string]interface{}{
			"agent":     agent,
			"available": false,
			"error":     "unknown agent",
		})
		return
	}

	out, err := cmd.CombinedOutput()
	// Take only the first line of version output
	version := strings.TrimSpace(string(out))
	if idx := strings.IndexByte(version, '\n'); idx >= 0 {
		version = strings.TrimSpace(version[:idx])
	}

	if err != nil {
		writeJSON(w, map[string]interface{}{
			"agent":     agent,
			"available": false,
			"version":   version,
			"error":     err.Error(),
		})
		return
	}

	writeJSON(w, map[string]interface{}{
		"agent":     agent,
		"available": true,
		"version":   version,
	})
}
