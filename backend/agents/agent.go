package agents

import (
	"context"
	"fmt"
	"io"
)

// TokenUsage captures token consumption from an agent invocation.
type TokenUsage struct {
	InputTokens  int `json:"input_tokens"`
	OutputTokens int `json:"output_tokens"`
}

// Agent defines the interface for CLI agent wrappers (cursor, codex, etc.)
type Agent interface {
	// Plan runs the agent in planning mode: analyzes code and returns a markdown plan.
	// Output is streamed line-by-line to logWriter.
	Plan(ctx context.Context, prompt string, workDir string, logWriter io.Writer) (string, *TokenUsage, error)

	// Execute runs the agent in execution mode: applies changes per the plan.
	// Output is streamed line-by-line to logWriter.
	Execute(ctx context.Context, prompt string, workDir string, logWriter io.Writer) (*TokenUsage, error)

	// Name returns the agent identifier (e.g. "cursor", "codex").
	Name() string
}

// NewAgent creates an agent by name.
func NewAgent(name string) (Agent, error) {
	switch name {
	case "cursor":
		return &CursorAgent{}, nil
	case "codex":
		return &CodexAgent{}, nil
	case "copilot":
		return &CopilotAgent{}, nil
	default:
		return nil, fmt.Errorf("unknown agent: %s", name)
	}
}
