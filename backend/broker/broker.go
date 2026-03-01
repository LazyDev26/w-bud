package broker

import (
	"fmt"
	"sync"
)

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
	ch := make(chan string, 256)
	// Register subscriber first so it also receives lines published concurrently.
	lb.subs[runID] = append(lb.subs[runID], ch)
	// Snapshot history under the lock, then release before writing to the channel
	// to avoid deadlocking when history exceeds the channel buffer.
	hist := make([]string, len(lb.history[runID]))
	copy(hist, lb.history[runID])
	lb.mu.Unlock()

	// Replay history outside the lock — the channel may fill up, so we use a
	// goroutine to avoid blocking the caller.
	go func() {
		for _, line := range hist {
			ch <- line
		}
	}()

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

// LogPublish writes a message to both the LogBroker and an optional log file writer.
func LogPublish(lb *LogBroker, runID string, logFile interface{ Write([]byte) (int, error) }, msg string) {
	lb.Publish(runID, msg)
	if logFile != nil {
		fmt.Fprintln(logFile, msg)
	}
}
