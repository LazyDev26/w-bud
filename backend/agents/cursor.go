package agents

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
)

// CursorAgent wraps the Cursor CLI for planning and execution.
// Cursor CLI usage: cursor --message "prompt" <directory>
type CursorAgent struct{}

func (a *CursorAgent) Name() string { return "cursor" }

func (a *CursorAgent) Plan(ctx context.Context, prompt string, workDir string, logWriter io.Writer) (string, *TokenUsage, error) {
	out, err := a.run(ctx, prompt, workDir, logWriter)
	return out, nil, err
}

func (a *CursorAgent) Execute(ctx context.Context, prompt string, workDir string, logWriter io.Writer) (*TokenUsage, error) {
	_, err := a.run(ctx, prompt, workDir, logWriter)
	return nil, err
}

func (a *CursorAgent) run(ctx context.Context, prompt string, workDir string, logWriter io.Writer) (string, error) {
	// Write prompt to a temp file so we don't hit arg length limits
	promptFile, err := WriteTempPrompt(prompt)
	if err != nil {
		return "", err
	}
	defer os.Remove(promptFile)

	// Read prompt from file and pass as --message
	promptBytes, err := os.ReadFile(promptFile)
	if err != nil {
		return "", fmt.Errorf("failed to read prompt file: %w", err)
	}

	// Cursor CLI: cursor --message "<prompt>" --yes <directory>
	// --yes ensures fully non-interactive / auto-approval mode
	cmd := exec.CommandContext(ctx, "cursor",
		"--message", string(promptBytes),
		"--yes",
		workDir,
	)
	cmd.Dir = workDir

	return ExecAndCapture(cmd, logWriter)
}
