package agents

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
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
	promptFile, err := writeTempPrompt(prompt)
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

	return execAndCapture(cmd, logWriter)
}

// writeTempPrompt writes a prompt to a temporary file and returns the path.
func writeTempPrompt(prompt string) (string, error) {
	tmpFile, err := os.CreateTemp("", "wbud-prompt-*.md")
	if err != nil {
		return "", fmt.Errorf("failed to create temp prompt file: %w", err)
	}
	if _, err := tmpFile.WriteString(prompt); err != nil {
		tmpFile.Close()
		os.Remove(tmpFile.Name())
		return "", fmt.Errorf("failed to write prompt: %w", err)
	}
	tmpFile.Close()
	return tmpFile.Name(), nil
}

// execAndCapture runs a command, streams output to logWriter, and returns all stdout.
func execAndCapture(cmd *exec.Cmd, logWriter io.Writer) (string, error) {
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", fmt.Errorf("failed to get stdout: %w", err)
	}

	cmd.Stderr = logWriter // stream stderr to log

	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("failed to start %s: %w", cmd.Path, err)
	}

	var output strings.Builder
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024) // 1MB buffer
	for scanner.Scan() {
		line := scanner.Text()
		output.WriteString(line)
		output.WriteString("\n")
		if logWriter != nil {
			fmt.Fprintln(logWriter, line)
		}
	}

	if err := cmd.Wait(); err != nil {
		return output.String(), fmt.Errorf("command exited with error: %w", err)
	}

	return output.String(), nil
}
