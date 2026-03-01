package agents

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
)

// WriteTempPrompt writes a prompt to a temporary file and returns the path.
func WriteTempPrompt(prompt string) (string, error) {
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

// ExecAndCapture runs a command, streams output to logWriter, and returns all stdout.
func ExecAndCapture(cmd *exec.Cmd, logWriter io.Writer) (string, error) {
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
