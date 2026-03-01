package agents

import (
	"context"
	"fmt"
	"io"
	"sync"
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

// LogBroker fans out log lines to multiple subscribers (e.g. WebSocket clients).
// It also keeps a history buffer so late subscribers get lines they missed.
type LogBroker struct {
	mu      sync.RWMutex
	subs    map[string][]chan string // runID -> list of subscriber channels
	history map[string][]string      // runID -> buffered lines
}

func NewLogBroker() *LogBroker {
	return &LogBroker{
		subs:    make(map[string][]chan string),
		history: make(map[string][]string),
	}
}

// Subscribe returns a channel that receives log lines for the given run.
// Any lines already published are replayed immediately.
func (lb *LogBroker) Subscribe(runID string) chan string {
	lb.mu.Lock()
	defer lb.mu.Unlock()
	ch := make(chan string, 256)
	// Replay history
	for _, line := range lb.history[runID] {
		ch <- line
	}
	lb.subs[runID] = append(lb.subs[runID], ch)
	return ch
}

// Unsubscribe removes a subscriber channel.
func (lb *LogBroker) Unsubscribe(runID string, ch chan string) {
	lb.mu.Lock()
	defer lb.mu.Unlock()
	subs := lb.subs[runID]
	for i, s := range subs {
		if s == ch {
			lb.subs[runID] = append(subs[:i], subs[i+1:]...)
			close(ch)
			return
		}
	}
}

// Publish sends a log line to all subscribers for the given run and buffers it.
func (lb *LogBroker) Publish(runID string, line string) {
	lb.mu.Lock()
	defer lb.mu.Unlock()
	lb.history[runID] = append(lb.history[runID], line)
	for _, ch := range lb.subs[runID] {
		select {
		case ch <- line:
		default:
			// subscriber too slow, drop line
		}
	}
}

// History returns the buffered log lines for a run.
func (lb *LogBroker) History(runID string) []string {
	lb.mu.RLock()
	defer lb.mu.RUnlock()
	lines := make([]string, len(lb.history[runID]))
	copy(lines, lb.history[runID])
	return lines
}

// Cleanup removes all subscribers and history for a run.
func (lb *LogBroker) Cleanup(runID string) {
	lb.mu.Lock()
	defer lb.mu.Unlock()
	for _, ch := range lb.subs[runID] {
		close(ch)
	}
	delete(lb.subs, runID)
	delete(lb.history, runID)
}

// BrokerWriter wraps LogBroker as an io.Writer so agent output streams to subscribers.
type BrokerWriter struct {
	Broker *LogBroker
	RunID  string
	buf    []byte
}

func (bw *BrokerWriter) Write(p []byte) (int, error) {
	bw.buf = append(bw.buf, p...)
	for {
		idx := -1
		for i, b := range bw.buf {
			if b == '\n' {
				idx = i
				break
			}
		}
		if idx < 0 {
			break
		}
		line := string(bw.buf[:idx])
		bw.buf = bw.buf[idx+1:]
		bw.Broker.Publish(bw.RunID, line)
	}
	return len(p), nil
}

// Flush sends any remaining buffered content.
func (bw *BrokerWriter) Flush() {
	if len(bw.buf) > 0 {
		bw.Broker.Publish(bw.RunID, string(bw.buf))
		bw.buf = nil
	}
}
