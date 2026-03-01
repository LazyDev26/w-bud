package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/w-bud/backend/agents"
	"github.com/w-bud/backend/models"
	"github.com/w-bud/backend/storage"
)

type RunHandler struct {
	Store     *storage.Store
	LogBroker *agents.LogBroker
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
	run := models.Run{
		RunID:               fmt.Sprintf("run-%s", uuid.New().String()[:8]),
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
		LogPath:             fmt.Sprintf("logs/run-%s.log", uuid.New().String()[:8]),
	}

	if err := h.Store.AddRun(run); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Start async planning in background
	go h.runPlanning(run.RunID)

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
	go h.runExecution(run.RunID)

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
		out, gitErr := exec.Command("git", "-C", wtPath, "diff", "HEAD", "--", filePath).Output()
		if gitErr != nil {
			// Try staged diff
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
	stories := resolveStories(previewIDs, sf.Stories)

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

	prompt := agents.BuildPlanningPrompt(stories, run, repos, cfg.GlobalPrompts)
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

// runPlanning invokes the configured planning agent to generate PLAN.md.
func (h *RunHandler) runPlanning(runID string) {
	handedOff := false
	var planLogFile *os.File
	defer func() {
		if planLogFile != nil {
			planLogFile.Close()
		}
		if !handedOff {
			h.cleanupBroker(runID)
		}
	}()

	run, err := h.Store.GetRun(runID)
	if err != nil || run == nil || run.Status == "aborted" {
		return
	}

	// Load config for agent selection, global prompts, workspaces root
	cfg, err := h.Store.GetConfig()
	if err != nil {
		h.failRun(runID, fmt.Sprintf("Failed to load config: %v", err))
		return
	}

	// Resolve planning agent
	agentName := cfg.Agents.PlanningAgent
	if agentName == "" {
		agentName = "cursor"
	}
	agent, err := agents.NewAgent(agentName)
	if err != nil {
		h.failRun(runID, fmt.Sprintf("Invalid planning agent %q: %v", agentName, err))
		return
	}

	// Load full story data
	sf, _ := h.Store.GetStories()
	planIDs := run.StoryIDs
	if len(planIDs) == 0 {
		planIDs = []string{run.StoryID}
	}
	stories := resolveStories(planIDs, sf.Stories)

	// Load repos
	repos, _ := h.Store.GetRepos()

	// Webex notifier
	notifier := &agents.WebexNotifier{Config: cfg.Webex}
	notifier.NotifyPlanningStarted(runID, run.StoryID, run.StorySummary, agent.Name())

	// Open log file early so all messages are captured
	absLogPath := filepath.Join(h.Store.DataDir(), run.LogPath)
	logDir := filepath.Dir(absLogPath)
	os.MkdirAll(logDir, 0755)
	planLogFile, _ = os.Create(absLogPath)

	// Set up worktrees
	h.logPublish(runID, planLogFile, fmt.Sprintf("[w-bud] Planning agent: %s", agent.Name()))
	h.logPublish(runID, planLogFile, fmt.Sprintf("[w-bud] Setting up worktrees in %s...", cfg.WorkspacesRoot))

	wtMgr := &agents.WorktreeManager{WorkspacesRoot: cfg.WorkspacesRoot}
	worktrees, err := wtMgr.SetupWorktrees(runID, run.BranchName, run.Repos, repos)
	if err != nil {
		h.failRun(runID, fmt.Sprintf("Worktree setup failed: %v", err))
		return
	}

	// Store worktree paths in the run
	run.Worktrees = worktrees
	h.Store.UpdateRun(*run)

	for repo, wtPath := range worktrees {
		h.logPublish(runID, planLogFile, fmt.Sprintf("[w-bud] Worktree ready: %s → %s (branch: %s)", repo, wtPath, run.BranchName))
	}

	// Build the planning prompt
	prompt := agents.BuildPlanningPrompt(stories, *run, repos, cfg.GlobalPrompts)

	// Save prompt to log for debugging
	promptFile := filepath.Join(logDir, runID+"-prompt.md")
	os.WriteFile(promptFile, []byte(prompt), 0644)
	h.logPublish(runID, planLogFile, fmt.Sprintf("[w-bud] Prompt saved to %s", promptFile))

	// Pick the first worktree as the primary working directory.
	// The prompt includes absolute paths to all worktrees for multi-repo navigation.
	var primaryDir string
	for _, wt := range worktrees {
		primaryDir = wt
		break
	}

	// Create a multi-writer: log file + broker
	var logWriter io.Writer
	brokerWriter := &agents.BrokerWriter{Broker: h.LogBroker, RunID: runID}
	if planLogFile != nil {
		logWriter = io.MultiWriter(planLogFile, brokerWriter)
	} else {
		logWriter = brokerWriter
	}

	h.logPublish(runID, planLogFile, fmt.Sprintf("[w-bud] Running %s agent for planning...", agent.Name()))

	// Run the planning agent (10 minute timeout)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	planOutput, planTokens, err := agent.Plan(ctx, prompt, primaryDir, logWriter)
	brokerWriter.Flush()

	// Re-fetch run in case it was aborted while agent was running
	run, _ = h.Store.GetRun(runID)
	if run == nil || run.Status == "aborted" {
		return
	}

	// Store planning token usage
	if planTokens != nil {
		run.PlanTokensIn = planTokens.InputTokens
		run.PlanTokensOut = planTokens.OutputTokens
	}

	if err != nil {
		log.Printf("[%s] Planning agent error: %v", runID, err)
		// If we got partial output, still use it
		if planOutput == "" {
			h.failRun(runID, fmt.Sprintf("Planning agent failed: %v", err))
			return
		}
		h.logPublish(runID, planLogFile, "[w-bud] Agent exited with error but produced output, using partial plan")
	}

	// Store plan
	run.PlanMD = planOutput

	// Always send the plan to Webex first
	notifier.NotifyPlanGenerated(runID, run.StoryID, run.PlanMD)

	// Auto-approve if configured
	if cfg.Agents.AutoApprovePlan {
		run.Status = "executing"
		h.Store.UpdateRun(*run)
		h.logPublish(runID, planLogFile, "[w-bud] Plan generated — auto-approved, proceeding to execution.")
		log.Printf("[%s] Planning complete, auto-approved", runID)
		notifier.NotifyPlanAutoApproved(runID, run.StoryID)
		handedOff = true
		go h.runExecution(runID)
		return
	}

	run.Status = "awaiting_approval"
	h.Store.UpdateRun(*run)

	h.logPublish(runID, planLogFile, "[w-bud] Plan generated — awaiting approval.")
	log.Printf("[%s] Planning complete, awaiting approval", runID)
	notifier.NotifyPlanReady(runID, run.StoryID)
}

// cleanupBroker cleans up the log broker for a run (no longer stores lines in the run).
func (h *RunHandler) cleanupBroker(runID string) {
	h.LogBroker.Cleanup(runID)
}

// logPublish writes a message to both the log file (if non-nil) and the LogBroker.
func (h *RunHandler) logPublish(runID string, logFile *os.File, msg string) {
	h.LogBroker.Publish(runID, msg)
	if logFile != nil {
		fmt.Fprintln(logFile, msg)
	}
}

// runExecution invokes the configured execution agent to implement the plan.
func (h *RunHandler) runExecution(runID string) {
	var execLogFile *os.File
	defer func() {
		if execLogFile != nil {
			execLogFile.Close()
		}
		h.cleanupBroker(runID)
	}()

	run, err := h.Store.GetRun(runID)
	if err != nil || run == nil || run.Status == "aborted" {
		return
	}

	cfg, err := h.Store.GetConfig()
	if err != nil {
		h.failRun(runID, fmt.Sprintf("Failed to load config: %v", err))
		return
	}

	agentName := cfg.Agents.ExecutionAgent
	if agentName == "" {
		agentName = "codex"
	}
	agent, err := agents.NewAgent(agentName)
	if err != nil {
		h.failRun(runID, fmt.Sprintf("Invalid execution agent %q: %v", agentName, err))
		return
	}

	// Load full stories + repos
	sf, _ := h.Store.GetStories()
	execIDs := run.StoryIDs
	if len(execIDs) == 0 {
		execIDs = []string{run.StoryID}
	}
	stories := resolveStories(execIDs, sf.Stories)
	repos, _ := h.Store.GetRepos()

	// If worktrees weren't set up during planning (shouldn't happen), set them up now
	if len(run.Worktrees) == 0 {
		wtMgr := &agents.WorktreeManager{WorkspacesRoot: cfg.WorkspacesRoot}
		worktrees, err := wtMgr.SetupWorktrees(runID, run.BranchName, run.Repos, repos)
		if err != nil {
			h.failRun(runID, fmt.Sprintf("Worktree setup failed: %v", err))
			return
		}
		run.Worktrees = worktrees
		h.Store.UpdateRun(*run)
	}

	// Open log file (append to existing planning log)
	absLogPath := filepath.Join(h.Store.DataDir(), run.LogPath)
	execLogFile, _ = os.OpenFile(absLogPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	brokerWriter := &agents.BrokerWriter{Broker: h.LogBroker, RunID: runID}
	var logWriter io.Writer
	if execLogFile != nil {
		logWriter = io.MultiWriter(execLogFile, brokerWriter)
	} else {
		logWriter = brokerWriter
	}

	// Webex notifier
	notifier := &agents.WebexNotifier{Config: cfg.Webex}
	notifier.NotifyExecutionStarted(runID, run.StoryID, agent.Name())

	// 30 minute timeout for entire execution across all repos
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	// For multi-repo: run the agent per-repo sequentially with scoped prompts.
	// For single-repo: use the original full prompt.
	var execErr error
	var totalExecTokens agents.TokenUsage
	if len(run.Worktrees) > 1 {
		for repoName, wtPath := range run.Worktrees {
			// Check abort between repos
			run, _ = h.Store.GetRun(runID)
			if run == nil || run.Status == "aborted" {
				return
			}

			h.logPublish(runID, execLogFile, fmt.Sprintf("[w-bud] Running %s agent for %s...", agent.Name(), repoName))
			prompt := agents.BuildRepoExecutionPrompt(stories, *run, repoName, repos, cfg.GlobalPrompts)

			repoTokens, repoErr := agent.Execute(ctx, prompt, wtPath, logWriter)
			brokerWriter.Flush()

			if repoTokens != nil {
				totalExecTokens.InputTokens += repoTokens.InputTokens
				totalExecTokens.OutputTokens += repoTokens.OutputTokens
			}

			if repoErr != nil {
				h.logPublish(runID, execLogFile, fmt.Sprintf("[w-bud] %s execution failed for %s: %v", agent.Name(), repoName, repoErr))
				execErr = fmt.Errorf("%s failed: %w", repoName, repoErr)
				break
			}
			h.logPublish(runID, execLogFile, fmt.Sprintf("[w-bud] %s execution completed for %s.", agent.Name(), repoName))
		}
	} else {
		prompt := agents.BuildExecutionPrompt(stories, *run, repos, cfg.GlobalPrompts)
		var primaryDir string
		for _, wt := range run.Worktrees {
			primaryDir = wt
			break
		}
		h.logPublish(runID, execLogFile, fmt.Sprintf("[w-bud] Running %s agent for execution...", agent.Name()))
		execTokens, execE := agent.Execute(ctx, prompt, primaryDir, logWriter)
		execErr = execE
		brokerWriter.Flush()
		if execTokens != nil {
			totalExecTokens = *execTokens
		}
	}

	// Re-fetch run
	run, _ = h.Store.GetRun(runID)
	if run == nil || run.Status == "aborted" {
		return
	}

	// Store execution token usage
	run.ExecTokensIn = totalExecTokens.InputTokens
	run.ExecTokensOut = totalExecTokens.OutputTokens

	now := time.Now()
	dur := now.Sub(*run.StartedAt).Seconds()
	run.CompletedAt = &now
	run.DurationSeconds = &dur

	if execErr != nil {
		log.Printf("[%s] Execution agent error: %v", runID, execErr)
		run.Status = "failed"
		run.Error = execErr.Error()
		notifier.NotifyExecutionFailed(runID, run.StoryID, execErr.Error())
	} else {
		run.Status = "done"
		// Collect changed files from worktrees via git diff
		run.ChangedFiles = h.collectChangedFiles(run.Worktrees)
		notifier.NotifyExecutionDone(runID, run.StoryID, len(run.ChangedFiles), dur)
	}

	// Release locks
	locks, _ := h.Store.GetLocks()
	for repo, lockRunID := range locks {
		if lockRunID == runID {
			delete(locks, repo)
		}
	}
	h.Store.SaveLocks(locks)

	h.Store.UpdateRun(*run)

	status := run.Status
	h.logPublish(runID, execLogFile, fmt.Sprintf("[w-bud] Execution %s.", status))
	log.Printf("[%s] Execution complete: %s", runID, status)
}

// failRun marks a run as failed with the given error message.
func (h *RunHandler) failRun(runID string, errMsg string) {
	log.Printf("[%s] FAIL: %s", runID, errMsg)
	h.LogBroker.Publish(runID, fmt.Sprintf("[w-bud] ERROR: %s", errMsg))

	run, err := h.Store.GetRun(runID)
	if err != nil || run == nil {
		return
	}
	now := time.Now()
	run.Status = "failed"
	run.Error = errMsg
	run.CompletedAt = &now
	if run.StartedAt != nil {
		dur := now.Sub(*run.StartedAt).Seconds()
		run.DurationSeconds = &dur
	}
	h.Store.UpdateRun(*run)
}

// resolveStories looks up Story objects by their IDs from the full stories list.
func resolveStories(ids []string, all []models.Story) []models.Story {
	var out []models.Story
	for _, id := range ids {
		for _, s := range all {
			if s.ID == id {
				out = append(out, s)
				break
			}
		}
	}
	return out
}

// collectChangedFiles uses git diff in each worktree to find modified files.
func (h *RunHandler) collectChangedFiles(worktrees map[string]string) []string {
	var files []string
	for repo, wtPath := range worktrees {
		out, err := exec.Command("git", "-C", wtPath, "diff", "--name-only", "HEAD").Output()
		if err != nil {
			continue
		}
		for _, f := range strings.Split(strings.TrimSpace(string(out)), "\n") {
			if f != "" {
				files = append(files, fmt.Sprintf("%s/%s", repo, f))
			}
		}
	}
	return files
}
