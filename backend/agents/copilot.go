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

// CopilotAgent wraps the GitHub Copilot CLI for planning and execution.
type CopilotAgent struct{}

func (a *CopilotAgent) Name() string { return "copilot" }

func (a *CopilotAgent) Plan(ctx context.Context, prompt string, workDir string, logWriter io.Writer) (string, *TokenUsage, error) {
	output, err := a.run(ctx, prompt, workDir, logWriter)
	if err != nil && output == "" {
		return "", nil, err
	}
	return output, nil, err
}

func (a *CopilotAgent) Execute(ctx context.Context, prompt string, workDir string, logWriter io.Writer) (*TokenUsage, error) {
	_, err := a.run(ctx, prompt, workDir, logWriter)
	return nil, err
}

func (a *CopilotAgent) run(ctx context.Context, prompt string, workDir string, logWriter io.Writer) (string, error) {
	// copilot --autopilot --yolo -s -p "<prompt>"
	// --autopilot: auto-continue without user input
	// --yolo: allow all tools, paths, urls
	// -s (--silent): output only agent response, no stats
	// -p: non-interactive prompt mode
	args := []string{"--autopilot", "--yolo", "-s", "-p", prompt}

	cmd := exec.CommandContext(ctx, "copilot", args...)
	cmd.Dir = workDir
	cmd.Env = append(os.Environ(), "NO_COLOR=1")

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", fmt.Errorf("failed to get stdout: %w", err)
	}
	cmd.Stderr = logWriter

	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("failed to start copilot: %w", err)
	}

	// Stream stdout line by line and capture full output
	var outputBuilder strings.Builder
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		outputBuilder.WriteString(line)
		outputBuilder.WriteString("\n")
		if logWriter != nil {
			fmt.Fprintf(logWriter, "[copilot] %s\n", line)
		}
	}

	execErr := cmd.Wait()
	output := strings.TrimSpace(outputBuilder.String())

	if execErr != nil {
		return output, fmt.Errorf("copilot exited with error: %w", execErr)
	}
	return output, nil
}
