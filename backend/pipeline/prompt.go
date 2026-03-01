package pipeline

import (
	"fmt"
	"strings"

	"github.com/w-bud/backend/models"
)

// BuildPlanningPrompt assembles the full prompt sent to the planning agent.
func BuildPlanningPrompt(stories []models.Story, run models.Run, repos []models.Repo, globalPrompts []models.GlobalPrompt) string {
	var b strings.Builder

	b.WriteString("# Planning Task\n\n")
	b.WriteString("You are a senior software engineer. Analyze the codebase and generate a detailed implementation plan.\n\n")

	// Story details
	if len(stories) == 1 {
		b.WriteString("## Story\n")
	} else {
		b.WriteString("## Stories\n")
	}
	for i, story := range stories {
		if len(stories) > 1 {
			b.WriteString(fmt.Sprintf("### Story %d\n", i+1))
		}
		b.WriteString(fmt.Sprintf("- **ID**: %s\n", story.ID))
		b.WriteString(fmt.Sprintf("- **Summary**: %s\n", story.Summary))
		if story.Description != "" {
			b.WriteString(fmt.Sprintf("- **Description**: %s\n", story.Description))
		}
		if story.AcceptanceCriteria != "" {
			b.WriteString(fmt.Sprintf("- **Acceptance Criteria**: %s\n", story.AcceptanceCriteria))
		}
		if story.Priority != "" {
			b.WriteString(fmt.Sprintf("- **Priority**: %s\n", story.Priority))
		}
		if len(story.Subtasks) > 0 {
			b.WriteString("- **Subtasks**:\n")
			for _, st := range story.Subtasks {
				b.WriteString(fmt.Sprintf("  - %s: %s (%s)\n", st.ID, st.Summary, st.Status))
			}
		}
		b.WriteString("\n")
	}

	// Target repositories with worktree paths
	b.WriteString("## Target Repositories\n")
	for _, repoName := range run.Repos {
		wtPath, hasWT := run.Worktrees[repoName]
		for _, repo := range repos {
			if repo.Name == repoName {
				if hasWT {
					b.WriteString(fmt.Sprintf("- **%s** → `%s`\n", repo.Name, wtPath))
				} else {
					b.WriteString(fmt.Sprintf("- **%s** → `%s`\n", repo.Name, repo.Path))
				}
				break
			}
		}
	}
	if len(run.Repos) > 1 {
		b.WriteString("\n**IMPORTANT**: This task spans multiple repositories. Your plan MUST cover changes needed in ALL repositories listed above.\n")
	}
	b.WriteString("\n")

	// Repository-specific instructions (only if any repo has a prompt)
	writeRepoPrompts(&b, run.Repos, repos)

	// User-provided context
	if run.Context != "" {
		b.WriteString("## Additional Context\n")
		b.WriteString(run.Context)
		b.WriteString("\n\n")
	}

	if run.Constraints != "" {
		b.WriteString("## Constraints\n")
		b.WriteString(run.Constraints)
		b.WriteString("\n\n")
	}

	if run.VerificationContext != "" {
		b.WriteString("## Verification Criteria\n")
		b.WriteString(run.VerificationContext)
		b.WriteString("\n\n")
	}

	// Global prompts (enabled, tagged planning or both)
	planningPrompts := filterPrompts(globalPrompts, "planning")
	if len(planningPrompts) > 0 {
		b.WriteString("## Global Instructions\n")
		for _, p := range planningPrompts {
			b.WriteString(fmt.Sprintf("- %s\n", p.Text))
		}
		b.WriteString("\n")
	}

	// Output instructions
	b.WriteString(`## Output Requirements
Generate a detailed implementation plan in Markdown format with the following sections:

1. **Goal** — What needs to be achieved
2. **Scope** — Which files need to be created or modified (be specific)
3. **Steps** — Ordered implementation steps with details
4. **Testing** — How to verify the changes work correctly
5. **Risks** — Potential issues or concerns

Output ONLY the plan in clean Markdown. Do not include any preamble or commentary.
`)

	return b.String()
}

// BuildExecutionPrompt assembles the prompt sent to the execution agent.
func BuildExecutionPrompt(stories []models.Story, run models.Run, repos []models.Repo, globalPrompts []models.GlobalPrompt) string {
	var b strings.Builder

	b.WriteString("# Execution Task\n\n")
	b.WriteString("You are a senior software engineer. Implement the changes described in the plan below.\n\n")

	// Story context
	if len(stories) == 1 {
		b.WriteString("## Story\n")
	} else {
		b.WriteString("## Stories\n")
	}
	for _, story := range stories {
		b.WriteString(fmt.Sprintf("- **ID**: %s\n", story.ID))
		b.WriteString(fmt.Sprintf("- **Summary**: %s\n", story.Summary))
	}
	b.WriteString("\n")

	// Worktree paths — critical for multi-repo execution
	if len(run.Worktrees) > 0 {
		b.WriteString("## Working Directories\n")
		b.WriteString("Each repository has its own worktree. You MUST implement changes in ALL repositories listed below.\n")
		for repoName, wtPath := range run.Worktrees {
			b.WriteString(fmt.Sprintf("- **%s** → `%s`\n", repoName, wtPath))
		}
		if len(run.Worktrees) > 1 {
			b.WriteString("\n**IMPORTANT**: This task spans multiple repositories. Use the absolute paths above to navigate between them. Do NOT skip any repository.\n")
		}
		b.WriteString("\n")
	}

	// Repository-specific instructions (only if any repo has a prompt)
	writeRepoPrompts(&b, run.Repos, repos)

	// Plan
	b.WriteString("## Approved Plan\n")
	b.WriteString(run.PlanMD)
	b.WriteString("\n\n")

	// Constraints
	if run.Constraints != "" {
		b.WriteString("## Constraints\n")
		b.WriteString(run.Constraints)
		b.WriteString("\n\n")
	}

	// Global prompts (enabled, tagged execution or both)
	execPrompts := filterPrompts(globalPrompts, "execution")
	if len(execPrompts) > 0 {
		b.WriteString("## Global Instructions\n")
		for _, p := range execPrompts {
			b.WriteString(fmt.Sprintf("- %s\n", p.Text))
		}
		b.WriteString("\n")
	}

	b.WriteString("## Instructions\nImplement all changes described in the plan above. Follow existing code patterns and conventions.\n")

	return b.String()
}

// BuildRepoExecutionPrompt assembles a repo-scoped execution prompt for multi-repo runs.
// The agent is told to implement ONLY the changes for the given repo from the full plan.
func BuildRepoExecutionPrompt(stories []models.Story, run models.Run, repoName string, repos []models.Repo, globalPrompts []models.GlobalPrompt) string {
	var b strings.Builder

	b.WriteString("# Execution Task\n\n")
	b.WriteString(fmt.Sprintf("You are a senior software engineer. Implement ONLY the changes for the **%s** repository as described in the plan below.\n\n", repoName))

	// Story context
	if len(stories) == 1 {
		b.WriteString("## Story\n")
	} else {
		b.WriteString("## Stories\n")
	}
	for _, story := range stories {
		b.WriteString(fmt.Sprintf("- **ID**: %s\n", story.ID))
		b.WriteString(fmt.Sprintf("- **Summary**: %s\n", story.Summary))
	}
	b.WriteString("\n")

	b.WriteString(fmt.Sprintf("## Target Repository: %s\n", repoName))
	b.WriteString(fmt.Sprintf("You are working inside the `%s` repository. Implement ONLY the changes from the plan that belong to this repository. Ignore sections of the plan that target other repositories.\n\n", repoName))

	// Repository-specific instructions for this repo
	if p := getRepoPrompt(repoName, repos); p != "" {
		b.WriteString("## Repository-Specific Instructions\n")
		b.WriteString(p)
		b.WriteString("\n\n")
	}

	// Plan
	b.WriteString("## Approved Plan\n")
	b.WriteString(run.PlanMD)
	b.WriteString("\n\n")

	// Constraints
	if run.Constraints != "" {
		b.WriteString("## Constraints\n")
		b.WriteString(run.Constraints)
		b.WriteString("\n\n")
	}

	// Global prompts
	execPrompts := filterPrompts(globalPrompts, "execution")
	if len(execPrompts) > 0 {
		b.WriteString("## Global Instructions\n")
		for _, p := range execPrompts {
			b.WriteString(fmt.Sprintf("- %s\n", p.Text))
		}
		b.WriteString("\n")
	}

	b.WriteString(fmt.Sprintf("## Instructions\nImplement ONLY the `%s` changes from the plan above. Do NOT create or modify files belonging to other repositories. Follow existing code patterns and conventions.\n", repoName))

	return b.String()
}

// filterPrompts returns enabled prompts matching the given phase ("planning" or "execution").
func filterPrompts(prompts []models.GlobalPrompt, phase string) []models.GlobalPrompt {
	var out []models.GlobalPrompt
	for _, p := range prompts {
		if !p.Enabled {
			continue
		}
		if p.Tag == phase || p.Tag == "both" {
			out = append(out, p)
		}
	}
	return out
}

// writeRepoPrompts writes a "Repository-Specific Instructions" section if any
// of the run's repos have a non-empty Prompt. If none do, nothing is written.
func writeRepoPrompts(b *strings.Builder, repoNames []string, repos []models.Repo) {
	type entry struct {
		name   string
		prompt string
	}
	var entries []entry
	for _, rn := range repoNames {
		if p := getRepoPrompt(rn, repos); p != "" {
			entries = append(entries, entry{name: rn, prompt: p})
		}
	}
	if len(entries) == 0 {
		return
	}
	b.WriteString("## Repository-Specific Instructions\n")
	for _, e := range entries {
		if len(entries) > 1 {
			b.WriteString(fmt.Sprintf("### %s\n", e.name))
		}
		b.WriteString(e.prompt)
		b.WriteString("\n\n")
	}
}

// getRepoPrompt returns the Prompt for a repo by name, or "" if not found/empty.
func getRepoPrompt(repoName string, repos []models.Repo) string {
	for _, r := range repos {
		if r.Name == repoName {
			return r.Prompt
		}
	}
	return ""
}
