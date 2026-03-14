package pipeline

import (
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/w-bud/backend/agents"
	"github.com/w-bud/backend/broker"
	"github.com/w-bud/backend/git"
	"github.com/w-bud/backend/models"
	"github.com/w-bud/backend/notify"
	"github.com/w-bud/backend/storage"
)

// Runner orchestrates the planning and execution pipeline for runs.
type Runner struct {
	Store     *storage.Store
	LogBroker *broker.LogBroker
}

// RunPlanning invokes the configured planning agent to generate PLAN.md.
func (r *Runner) RunPlanning(runID string) {
	handedOff := false
	var planLogFile *os.File
	defer func() {
		if planLogFile != nil {
			planLogFile.Close()
		}
		if !handedOff {
			r.LogBroker.Cleanup(runID)
		}
	}()

	run, err := r.Store.GetRun(runID)
	if err != nil || run == nil || run.Status == "aborted" {
		return
	}

	// Load config for agent selection, global prompts, workspaces root
	cfg, err := r.Store.GetConfig()
	if err != nil {
		r.failRun(runID, fmt.Sprintf("Failed to load config: %v", err))
		return
	}

	// Resolve planning agent
	agentName := cfg.Agents.PlanningAgent
	if agentName == "" {
		agentName = "cursor"
	}
	agent, err := agents.NewAgent(agentName)
	if err != nil {
		r.failRun(runID, fmt.Sprintf("Invalid planning agent %q: %v", agentName, err))
		return
	}

	// Load full story data
	sf, _ := r.Store.GetStories()
	planIDs := run.StoryIDs
	if len(planIDs) == 0 {
		planIDs = []string{run.StoryID}
	}
	stories := ResolveStories(planIDs, sf.Stories)

	// Load repos
	repos, _ := r.Store.GetRepos()

	// Webex notifier
	notifier := &notify.WebexNotifier{Config: cfg.Webex}
	notifier.NotifyPlanningStarted(runID, run.StoryID, run.StorySummary, agent.Name())

	// Open log file early so all messages are captured
	absLogPath := filepath.Join(r.Store.DataDir(), run.LogPath)
	logDir := filepath.Dir(absLogPath)
	os.MkdirAll(logDir, 0755)
	planLogFile, _ = os.Create(absLogPath)

	// Set up worktrees
	broker.LogPublish(r.LogBroker, runID, planLogFile, fmt.Sprintf("[w-bud] Planning agent: %s", agent.Name()))
	broker.LogPublish(r.LogBroker, runID, planLogFile, fmt.Sprintf("[w-bud] Setting up worktrees in %s...", cfg.WorkspacesRoot))

	wtMgr := &git.WorktreeManager{WorkspacesRoot: cfg.WorkspacesRoot}
	worktrees, err := wtMgr.SetupWorktrees(runID, run.BranchName, run.Repos, repos)
	if err != nil {
		r.failRun(runID, fmt.Sprintf("Worktree setup failed: %v", err))
		return
	}

	// Store worktree paths in the run
	run.Worktrees = worktrees
	r.Store.UpdateRun(*run)

	for repo, wtPath := range worktrees {
		broker.LogPublish(r.LogBroker, runID, planLogFile, fmt.Sprintf("[w-bud] Worktree ready: %s → %s (branch: %s)", repo, wtPath, run.BranchName))
	}

	// Build the planning prompt
	prompt := BuildPlanningPrompt(stories, *run, repos, cfg.GlobalPrompts)

	// Save prompt to log for debugging
	promptFile := filepath.Join(logDir, "prompt.md")
	os.WriteFile(promptFile, []byte(prompt), 0644)
	broker.LogPublish(r.LogBroker, runID, planLogFile, fmt.Sprintf("[w-bud] Prompt saved to %s", promptFile))

	// Pick the first worktree as the primary working directory.
	// The prompt includes absolute paths to all worktrees for multi-repo navigation.
	var primaryDir string
	for _, wt := range worktrees {
		primaryDir = wt
		break
	}

	// Create a multi-writer: log file + broker
	var logWriter io.Writer
	brokerWriter := &broker.BrokerWriter{Broker: r.LogBroker, RunID: runID}
	if planLogFile != nil {
		logWriter = io.MultiWriter(planLogFile, brokerWriter)
	} else {
		logWriter = brokerWriter
	}

	broker.LogPublish(r.LogBroker, runID, planLogFile, fmt.Sprintf("[w-bud] Running %s agent for planning...", agent.Name()))

	// Run the planning agent (10 minute timeout)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	planOutput, planTokens, err := agent.Plan(ctx, prompt, primaryDir, logWriter)
	brokerWriter.Flush()

	// Re-fetch run in case it was aborted while agent was running
	run, _ = r.Store.GetRun(runID)
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
			r.failRun(runID, fmt.Sprintf("Planning agent failed: %v", err))
			return
		}
		broker.LogPublish(r.LogBroker, runID, planLogFile, "[w-bud] Agent exited with error but produced output, using partial plan")
	}

	// Store plan
	run.PlanMD = planOutput

	// Always send the plan to Webex first
	notifier.NotifyPlanGenerated(runID, run.StoryID, run.PlanMD)

	// Auto-approve if configured
	if cfg.Agents.AutoApprovePlan {
		run.Status = "executing"
		r.Store.UpdateRun(*run)
		broker.LogPublish(r.LogBroker, runID, planLogFile, "[w-bud] Plan generated — auto-approved, proceeding to execution.")
		log.Printf("[%s] Planning complete, auto-approved", runID)
		notifier.NotifyPlanAutoApproved(runID, run.StoryID)
		handedOff = true
		go r.RunExecution(runID)
		return
	}

	run.Status = "awaiting_approval"
	r.Store.UpdateRun(*run)

	broker.LogPublish(r.LogBroker, runID, planLogFile, "[w-bud] Plan generated — awaiting approval.")
	log.Printf("[%s] Planning complete, awaiting approval", runID)
	notifier.NotifyPlanReady(runID, run.StoryID)
}

// RunExecution invokes the configured execution agent to implement the plan.
func (r *Runner) RunExecution(runID string) {
	var execLogFile *os.File
	defer func() {
		if execLogFile != nil {
			execLogFile.Close()
		}
		r.LogBroker.Cleanup(runID)
	}()

	run, err := r.Store.GetRun(runID)
	if err != nil || run == nil || run.Status == "aborted" {
		return
	}

	cfg, err := r.Store.GetConfig()
	if err != nil {
		r.failRun(runID, fmt.Sprintf("Failed to load config: %v", err))
		return
	}

	agentName := cfg.Agents.ExecutionAgent
	if agentName == "" {
		agentName = "codex"
	}
	agent, err := agents.NewAgent(agentName)
	if err != nil {
		r.failRun(runID, fmt.Sprintf("Invalid execution agent %q: %v", agentName, err))
		return
	}

	// Load full stories + repos
	sf, _ := r.Store.GetStories()
	execIDs := run.StoryIDs
	if len(execIDs) == 0 {
		execIDs = []string{run.StoryID}
	}
	stories := ResolveStories(execIDs, sf.Stories)
	repos, _ := r.Store.GetRepos()

	// If worktrees weren't set up during planning (shouldn't happen), set them up now
	if len(run.Worktrees) == 0 {
		wtMgr := &git.WorktreeManager{WorkspacesRoot: cfg.WorkspacesRoot}
		worktrees, err := wtMgr.SetupWorktrees(runID, run.BranchName, run.Repos, repos)
		if err != nil {
			r.failRun(runID, fmt.Sprintf("Worktree setup failed: %v", err))
			return
		}
		run.Worktrees = worktrees
		r.Store.UpdateRun(*run)
	}

	// Open log file (append to existing planning log)
	absLogPath := filepath.Join(r.Store.DataDir(), run.LogPath)
	execLogFile, _ = os.OpenFile(absLogPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	brokerWriter := &broker.BrokerWriter{Broker: r.LogBroker, RunID: runID}
	var logWriter io.Writer
	if execLogFile != nil {
		logWriter = io.MultiWriter(execLogFile, brokerWriter)
	} else {
		logWriter = brokerWriter
	}

	// Webex notifier
	notifier := &notify.WebexNotifier{Config: cfg.Webex}
	notifier.NotifyExecutionStarted(runID, run.StoryID, agent.Name())

	// 30 minute timeout for entire execution across all repos
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	// Build a unified execution prompt that includes all worktree paths.
	// The agent runs in a single session with access to all repos, enabling
	// cross-repo awareness and self-correction.
	prompt := BuildExecutionPrompt(stories, *run, repos, cfg.GlobalPrompts)

	// Save execution prompt to log folder for debugging
	execLogDir := filepath.Dir(absLogPath)
	execPromptFile := filepath.Join(execLogDir, "exec-prompt.md")
	os.WriteFile(execPromptFile, []byte(prompt), 0644)
	broker.LogPublish(r.LogBroker, runID, execLogFile, fmt.Sprintf("[w-bud] Execution prompt saved to %s", execPromptFile))

	// Use the common parent of all worktrees as the working directory so the
	// agent's sandbox (e.g. Codex --full-auto) covers all repo worktrees.
	// Worktrees live at <workspacesRoot>/<runID>/<repoName>, so the parent is
	// the run directory that contains every repo.
	var primaryDir string
	for _, wt := range run.Worktrees {
		primaryDir = filepath.Dir(wt)
		break
	}

	broker.LogPublish(r.LogBroker, runID, execLogFile, fmt.Sprintf("[w-bud] Running %s agent for execution...", agent.Name()))
	var execErr error
	var totalExecTokens agents.TokenUsage
	var execOutput string
	execOut, execTokens, execE := agent.Execute(ctx, prompt, primaryDir, logWriter)
	execErr = execE
	execOutput = execOut
	brokerWriter.Flush()
	if execTokens != nil {
		totalExecTokens = *execTokens
	}

	// Re-fetch run
	run, _ = r.Store.GetRun(runID)
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
		// Store partial output even on failure for debugging
		if execOutput != "" {
			run.ExecMD = execOutput
		}
		notifier.NotifyExecutionFailed(runID, run.StoryID, execErr.Error())
	} else {
		run.Status = "done"
		run.ExecMD = execOutput
		// Collect changed files from worktrees via git diff
		run.ChangedFiles = git.CollectChangedFiles(run.Worktrees)

		// Commit and push changes (if auto_push is enabled)
		if len(run.ChangedFiles) > 0 && cfg.Agents.AutoPush {
			commitMsg := buildCommitMessage(run.StoryIDs, run.StoryID, run.StorySummary)
			broker.LogPublish(r.LogBroker, runID, execLogFile, fmt.Sprintf("[w-bud] Committing and pushing changes: %s", commitMsg))
			pushResults := git.CommitAndPush(run.Worktrees, run.BranchName, commitMsg)
			for repo, pushErr := range pushResults {
				if pushErr != nil {
					broker.LogPublish(r.LogBroker, runID, execLogFile, fmt.Sprintf("[w-bud] Push failed for %s: %v", repo, pushErr))
					log.Printf("[%s] Push failed for %s: %v", runID, repo, pushErr)
				} else {
					broker.LogPublish(r.LogBroker, runID, execLogFile, fmt.Sprintf("[w-bud] Pushed %s → origin/%s", repo, run.BranchName))
				}
			}
		} else if len(run.ChangedFiles) > 0 {
			broker.LogPublish(r.LogBroker, runID, execLogFile, "[w-bud] Auto-push disabled. Use the Push button in the UI to commit and push changes.")
		}

		notifier.NotifyExecutionDone(runID, run.StoryID, len(run.ChangedFiles), dur)
	}

	// Release locks
	locks, _ := r.Store.GetLocks()
	for repo, lockRunID := range locks {
		if lockRunID == runID {
			delete(locks, repo)
		}
	}
	r.Store.SaveLocks(locks)

	r.Store.UpdateRun(*run)

	status := run.Status
	broker.LogPublish(r.LogBroker, runID, execLogFile, fmt.Sprintf("[w-bud] Execution %s.", status))
	log.Printf("[%s] Execution complete: %s", runID, status)
}

// failRun marks a run as failed with the given error message.
func (r *Runner) failRun(runID string, errMsg string) {
	log.Printf("[%s] FAIL: %s", runID, errMsg)
	r.LogBroker.Publish(runID, fmt.Sprintf("[w-bud] ERROR: %s", errMsg))

	run, err := r.Store.GetRun(runID)
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
	r.Store.UpdateRun(*run)
}

// buildCommitMessage creates a commit message from story IDs and summary.
// Format: "feat(STORY-123): Summary of the story\n\nAutomated by w-bud"
func buildCommitMessage(storyIDs []string, fallbackID string, summary string) string {
	ids := storyIDs
	if len(ids) == 0 {
		ids = []string{fallbackID}
	}
	idStr := strings.Join(ids, ", ")
	msg := fmt.Sprintf("feat(%s): %s\n\nAutomated by w-bud", idStr, summary)
	return msg
}

// ResolveStories looks up Story objects by their IDs from the full stories list.
func ResolveStories(ids []string, all []models.Story) []models.Story {
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
