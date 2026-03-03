package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/w-bud/backend/models"
	"github.com/w-bud/backend/notify"
	"github.com/w-bud/backend/pipeline"
	"github.com/w-bud/backend/storage"
)

type RunHandler struct {
	Store    *storage.Store
	Pipeline *pipeline.Runner
}

func (h *RunHandler) List(w http.ResponseWriter, r *http.Request) {
	runs, err := h.Store.GetRuns()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, runs)
}

func (h *RunHandler) Get(w http.ResponseWriter, r *http.Request) {
	runID := chi.URLParam(r, "runID")
	run, err := h.Store.GetRun(runID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if run == nil {
		http.Error(w, "Run not found", http.StatusNotFound)
		return
	}
	writeJSON(w, run)
}

func (h *RunHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req models.CreateRunRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Normalize: prefer StoryIDs, fall back to single StoryID
	storyIDs := req.StoryIDs
	if len(storyIDs) == 0 && req.StoryID != "" {
		storyIDs = []string{req.StoryID}
	}
	if len(storyIDs) == 0 || len(req.Repos) == 0 {
		http.Error(w, "story_ids (or story_id) and repos are required", http.StatusBadRequest)
		return
	}

	// Look up story summaries
	sf, _ := h.Store.GetStories()
	var summaries []string
	for _, sid := range storyIDs {
		for _, s := range sf.Stories {
			if s.ID == sid {
				summaries = append(summaries, s.Summary)
				break
			}
		}
	}

	now := time.Now()
	runID := fmt.Sprintf("run-%s", uuid.New().String()[:8])
	run := models.Run{
		RunID:               runID,
		StoryID:             storyIDs[0],
		StorySummary:        strings.Join(summaries, " | "),
		StoryIDs:            storyIDs,
		StorySummaries:      summaries,
		BranchName:          req.BranchName,
		Status:              "planning",
		Repos:               req.Repos,
		Worktrees:           map[string]string{},
		PlanMD:              "",
		Context:             req.Context,
		Constraints:         req.Constraints,
		VerificationContext: req.VerificationContext,
		StartedAt:           &now,
		ChangedFiles:        []string{},
		LogPath:             fmt.Sprintf("logs/%s/run.log", runID),
	}

	if err := h.Store.AddRun(run); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Start async planning in background
	go h.Pipeline.RunPlanning(run.RunID)

	w.WriteHeader(http.StatusCreated)
	writeJSON(w, run)
}

func (h *RunHandler) Approve(w http.ResponseWriter, r *http.Request) {
	runID := chi.URLParam(r, "runID")

	var req models.ApproveRunRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	run, err := h.Store.GetRun(runID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if run == nil {
		http.Error(w, "Run not found", http.StatusNotFound)
		return
	}
	if run.Status != "awaiting_approval" {
		http.Error(w, "Run is not awaiting approval", http.StatusBadRequest)
		return
	}

	if req.PlanMD != "" {
		run.PlanMD = req.PlanMD
	}
	run.Status = "executing"
	if err := h.Store.UpdateRun(*run); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Start async execution in background
	go h.Pipeline.RunExecution(run.RunID)

	writeJSON(w, run)
}

func (h *RunHandler) Abort(w http.ResponseWriter, r *http.Request) {
	runID := chi.URLParam(r, "runID")
	run, err := h.Store.GetRun(runID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if run == nil {
		http.Error(w, "Run not found", http.StatusNotFound)
		return
	}

	now := time.Now()
	run.Status = "aborted"
	run.CompletedAt = &now
	dur := now.Sub(*run.StartedAt).Seconds()
	run.DurationSeconds = &dur

	// Release locks
	locks, _ := h.Store.GetLocks()
	for repo, lockRunID := range locks {
		if lockRunID == runID {
			delete(locks, repo)
		}
	}
	h.Store.SaveLocks(locks)

	if err := h.Store.UpdateRun(*run); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Send Webex notification
	if cfg, err := h.Store.GetConfig(); err == nil {
		notifier := &notify.WebexNotifier{Config: cfg.Webex}
		notifier.NotifyRunAborted(runID, run.StoryID)
	}

	writeJSON(w, run)
}

func (h *RunHandler) Diff(w http.ResponseWriter, r *http.Request) {
	runID := chi.URLParam(r, "runID")
	run, err := h.Store.GetRun(runID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if run == nil {
		http.Error(w, "Run not found", http.StatusNotFound)
		return
	}

	// Optional: ?file=repo/path/to/file for a single file diff
	fileFilter := r.URL.Query().Get("file")

	type FileDiff struct {
		File string `json:"file"`
		Diff string `json:"diff"`
	}

	var diffs []FileDiff
	for _, changedFile := range run.ChangedFiles {
		if fileFilter != "" && changedFile != fileFilter {
			continue
		}
		// changedFile format: "repoName/path/to/file"
		parts := strings.SplitN(changedFile, "/", 2)
		if len(parts) != 2 {
			continue
		}
		repoName, filePath := parts[0], parts[1]
		wtPath, ok := run.Worktrees[repoName]
		if !ok {
			continue
		}
		// After auto-push, changes are committed so "git diff HEAD" returns nothing.
		// Strategy: try committed diff (HEAD~1..HEAD) first, then uncommitted diffs.
		var out []byte
		out, _ = exec.Command("git", "-C", wtPath, "diff", "HEAD~1", "HEAD", "--", filePath).Output()
		if len(out) == 0 {
			out, _ = exec.Command("git", "-C", wtPath, "diff", "HEAD", "--", filePath).Output()
		}
		if len(out) == 0 {
			out, _ = exec.Command("git", "-C", wtPath, "diff", "--cached", "HEAD", "--", filePath).Output()
		}
		diffs = append(diffs, FileDiff{
			File: changedFile,
			Diff: string(out),
		})
	}

	writeJSON(w, map[string]interface{}{
		"run_id": runID,
		"diffs":  diffs,
	})
}

func (h *RunHandler) PreviewPrompt(w http.ResponseWriter, r *http.Request) {
	var req models.CreateRunRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Normalize story IDs
	previewIDs := req.StoryIDs
	if len(previewIDs) == 0 && req.StoryID != "" {
		previewIDs = []string{req.StoryID}
	}

	// Look up stories
	sf, _ := h.Store.GetStories()
	stories := pipeline.ResolveStories(previewIDs, sf.Stories)

	// Build a temporary run object for prompt building
	run := models.Run{
		StoryID:             previewIDs[0],
		StoryIDs:            previewIDs,
		Repos:               req.Repos,
		Context:             req.Context,
		Constraints:         req.Constraints,
		VerificationContext: req.VerificationContext,
	}

	repos, _ := h.Store.GetRepos()
	cfg, _ := h.Store.GetConfig()

	prompt := pipeline.BuildPlanningPrompt(stories, run, repos, cfg.GlobalPrompts)
	writeJSON(w, map[string]string{"prompt": prompt})
}

// GetLogs returns the log lines for a run by reading from the log file.
func (h *RunHandler) GetLogs(w http.ResponseWriter, r *http.Request) {
	runID := chi.URLParam(r, "runID")
	run, err := h.Store.GetRun(runID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if run == nil {
		http.Error(w, "Run not found", http.StatusNotFound)
		return
	}

	var lines []string
	if run.LogPath != "" {
		absLogPath := filepath.Join(h.Store.DataDir(), run.LogPath)
		data, err := os.ReadFile(absLogPath)
		if err == nil {
			for _, line := range strings.Split(string(data), "\n") {
				if line != "" {
					lines = append(lines, line)
				}
			}
		}
	}

	writeJSON(w, map[string]interface{}{
		"run_id": runID,
		"lines":  lines,
	})
}
