package agents

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
)

// CodexAgent wraps the OpenAI Codex CLI for planning and execution.
type CodexAgent struct{}

func (a *CodexAgent) Name() string { return "codex" }

func (a *CodexAgent) Plan(ctx context.Context, prompt string, workDir string, logWriter io.Writer) (string, *TokenUsage, error) {
	lastMessage, outputFile, tokens, err := a.run(ctx, prompt, workDir, logWriter, true)
	if err != nil && lastMessage == "" {
		return "", tokens, err
	}
	// Prefer -o output file (contains only the agent's final message)
	if outputFile != "" {
		if data, readErr := os.ReadFile(outputFile); readErr == nil && len(data) > 0 {
			return string(data), tokens, nil
		}
	}
	// Fall back to last assistant message extracted from JSONL
	return lastMessage, tokens, err
}

func (a *CodexAgent) Execute(ctx context.Context, prompt string, workDir string, logWriter io.Writer) (string, *TokenUsage, error) {
	lastMessage, _, tokens, err := a.run(ctx, prompt, workDir, logWriter, false)
	return lastMessage, tokens, err
}

func (a *CodexAgent) run(ctx context.Context, prompt string, workDir string, logWriter io.Writer, captureOutput bool) (string, string, *TokenUsage, error) {
	promptFile, err := WriteTempPrompt(prompt)
	if err != nil {
		return "", "", nil, err
	}
	defer os.Remove(promptFile)

	// Build args: codex exec --full-auto --json -C <dir> [-o <file>] <prompt>
	args := []string{"exec", "--full-auto", "--skip-git-repo-check", "--json", "-C", workDir}

	var outputFile string
	if captureOutput {
		outputFile = promptFile + ".out"
		args = append(args, "-o", outputFile)
	}
	args = append(args, prompt)

	cmd := exec.CommandContext(ctx, "codex", args...)
	cmd.Dir = workDir

	// Pipe stdout for JSONL event parsing
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", "", nil, fmt.Errorf("failed to get stdout: %w", err)
	}
	cmd.Stderr = logWriter

	if err := cmd.Start(); err != nil {
		return "", "", nil, fmt.Errorf("failed to start codex: %w", err)
	}

	// Parse JSONL events from stdout and write readable log lines
	var lastAssistantMsg string
	tokens := &TokenUsage{}
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		msg, content, tu := parseCodexEvent(line)
		if content != "" {
			lastAssistantMsg = content
		}
		if tu != nil {
			tokens.InputTokens += tu.InputTokens
			tokens.OutputTokens += tu.OutputTokens
		}
		if msg != "" && logWriter != nil {
			// msg may contain multiple lines (e.g. command output), publish each separately
			for _, ml := range strings.Split(msg, "\n") {
				if ml != "" {
					fmt.Fprintln(logWriter, ml)
				}
			}
		}
	}

	execErr := cmd.Wait()
	if execErr != nil {
		return lastAssistantMsg, outputFile, tokens, fmt.Errorf("command exited with error: %w", execErr)
	}
	return lastAssistantMsg, outputFile, tokens, nil
}

// parseCodexEvent extracts human-readable log lines from a codex JSONL event.
// Returns (logLines, assistantContent, *TokenUsage). logLines may be empty if the event is not log-worthy.
func parseCodexEvent(raw string) (string, string, *TokenUsage) {
	var evt map[string]interface{}
	if err := json.Unmarshal([]byte(raw), &evt); err != nil {
		return raw, "", nil
	}

	evtType, _ := evt["type"].(string)
	item, _ := evt["item"].(map[string]interface{})

	switch evtType {
	case "item.started":
		if item == nil {
			return "", "", nil
		}
		itemType, _ := item["type"].(string)
		if itemType == "command_execution" {
			cmd, _ := item["command"].(string)
			if cmd != "" {
				return fmt.Sprintf("[codex] exec → %s", cmd), "", nil
			}
		}
		return "", "", nil

	case "item.completed":
		if item == nil {
			return "", "", nil
		}
		itemType, _ := item["type"].(string)
		text, _ := item["text"].(string)

		switch itemType {
		case "reasoning":
			if text != "" {
				return fmt.Sprintf("[codex] thinking: %s", text), "", nil
			}
		case "agent_message":
			if text != "" {
				display := text
				if len(display) > 500 {
					display = display[:500] + "..."
				}
				return fmt.Sprintf("[codex] %s", display), text, nil
			}
		case "command_execution":
			cmd, _ := item["command"].(string)
			output, _ := item["aggregated_output"].(string)
			exitCode := -1
			if ec, ok := item["exit_code"].(float64); ok {
				exitCode = int(ec)
			}
			var lines []string
			if cmd != "" {
				lines = append(lines, fmt.Sprintf("[codex] exec → %s (exit %d)", cmd, exitCode))
			}
			if output != "" {
				for _, ol := range strings.Split(strings.TrimSpace(output), "\n") {
					lines = append(lines, fmt.Sprintf("[codex]   %s", ol))
				}
			}
			return strings.Join(lines, "\n"), "", nil
		}
		return "", "", nil

	case "turn.completed":
		var tu *TokenUsage
		if usage, ok := evt["usage"].(map[string]interface{}); ok {
			input, _ := usage["input_tokens"].(float64)
			output, _ := usage["output_tokens"].(float64)
			tu = &TokenUsage{InputTokens: int(input), OutputTokens: int(output)}
		}
		return "", "", tu

	case "error":
		msg, _ := evt["message"].(string)
		if msg == "" {
			msg = raw
		}
		return fmt.Sprintf("[codex] ERROR: %s", msg), "", nil

	default:
		return "", "", nil
	}
}
