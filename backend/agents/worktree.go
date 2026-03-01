package agents

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/w-bud/backend/models"
)

// WorktreeManager handles git worktree creation and cleanup.
type WorktreeManager struct {
	WorkspacesRoot string
}

// SetupWorktrees creates a git worktree for each repo under workspacesRoot/runID/repoName.
// Branch naming: uses the provided branchName (e.g. feature/STORY-123-my-feature).
// Returns a map of repoName -> worktree path.
func (wm *WorktreeManager) SetupWorktrees(runID string, branchName string, repoNames []string, repos []models.Repo) (map[string]string, error) {
	worktrees := make(map[string]string)
	runDir := filepath.Join(wm.WorkspacesRoot, runID)

	if err := os.MkdirAll(runDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create run directory: %w", err)
	}

	for _, repoName := range repoNames {
		var repo *models.Repo
		for i := range repos {
			if repos[i].Name == repoName {
				repo = &repos[i]
				break
			}
		}
		if repo == nil {
			return nil, fmt.Errorf("repo %q not found in registry", repoName)
		}

		wtPath := filepath.Join(runDir, repoName)

		// Get current branch/HEAD to base worktree from
		headRef, err := gitCurrentRef(repo.Path)
		if err != nil {
			return nil, fmt.Errorf("failed to get HEAD for %s: %w", repoName, err)
		}

		// Try creating worktree with new branch; if branch exists, clean up and reuse
		cmd := exec.Command("git", "-C", repo.Path, "worktree", "add", "-b", branchName, wtPath, headRef)
		out, err := cmd.CombinedOutput()
		if err != nil {
			// Remove any existing worktree using this branch, then prune
			removeWorktreeByBranch(repo.Path, branchName)
			os.RemoveAll(wtPath)

			// Retry with existing branch
			cmd2 := exec.Command("git", "-C", repo.Path, "worktree", "add", wtPath, branchName)
			out2, err2 := cmd2.CombinedOutput()
			if err2 != nil {
				return nil, fmt.Errorf("git worktree add failed for %s: %s — %w", repoName, string(out2), err2)
			}
			_ = out
		}

		worktrees[repoName] = wtPath
	}

	return worktrees, nil
}

// CleanupWorktrees removes worktrees and prunes.
func (wm *WorktreeManager) CleanupWorktrees(runID string, branchName string, repoNames []string, repos []models.Repo) {
	runDir := filepath.Join(wm.WorkspacesRoot, runID)

	for _, repoName := range repoNames {
		for _, repo := range repos {
			if repo.Name == repoName {
				wtPath := filepath.Join(runDir, repoName)
				exec.Command("git", "-C", repo.Path, "worktree", "remove", "--force", wtPath).Run()
				exec.Command("git", "-C", repo.Path, "branch", "-D", branchName).Run()
				break
			}
		}
	}

	os.RemoveAll(runDir)
}

// removeWorktreeByBranch finds and force-removes any worktree using the given branch.
func removeWorktreeByBranch(repoPath string, branchName string) {
	// List worktrees to find which path uses this branch
	out, err := exec.Command("git", "-C", repoPath, "worktree", "list", "--porcelain").Output()
	if err != nil {
		return
	}
	var wtPath string
	for _, line := range strings.Split(string(out), "\n") {
		if strings.HasPrefix(line, "worktree ") {
			wtPath = strings.TrimPrefix(line, "worktree ")
		}
		if strings.HasPrefix(line, "branch refs/heads/"+branchName) && wtPath != "" {
			exec.Command("git", "-C", repoPath, "worktree", "remove", "--force", wtPath).Run()
			os.RemoveAll(wtPath)
		}
	}
	exec.Command("git", "-C", repoPath, "worktree", "prune").Run()
}

func gitCurrentRef(repoPath string) (string, error) {
	cmd := exec.Command("git", "-C", repoPath, "rev-parse", "HEAD")
	out, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}
