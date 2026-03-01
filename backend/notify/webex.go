package notify

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/w-bud/backend/models"
)

// WebexNotifier sends notifications to a Webex room.
type WebexNotifier struct {
	Config models.WebexConfig
}

// Notify sends a markdown message to the configured Webex room.
// It's a no-op if token or room_id are not configured.
func (w *WebexNotifier) Notify(markdown string) {
	if w.Config.Token == "" || w.Config.RoomID == "" {
		return
	}

	payload := map[string]string{
		"roomId":   w.Config.RoomID,
		"markdown": markdown,
	}
	body, _ := json.Marshal(payload)

	req, err := http.NewRequest("POST", "https://webexapis.com/v1/messages", bytes.NewReader(body))
	if err != nil {
		log.Printf("[webex] failed to create request: %v", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+w.Config.Token)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("[webex] failed to send notification: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		log.Printf("[webex] notification failed with status %d", resp.StatusCode)
	}
}

// NotifyPlanningStarted notifies that planning has begun.
func (w *WebexNotifier) NotifyPlanningStarted(runID, storyID, storySummary, agent string) {
	w.Notify(fmt.Sprintf("🚀 **Planning Started**\n- **Run**: `%s`\n- **Story**: %s — %s\n- **Agent**: %s", runID, storyID, storySummary, agent))
}

// NotifyPlanGenerated sends the full plan to Webex. If the plan is large it is
// split into multiple messages at markdown heading boundaries to stay within
// the Webex message size limit (~7 KB). The original text is preserved as-is.
func (w *WebexNotifier) NotifyPlanGenerated(runID, storyID, planMD string) {
	header := fmt.Sprintf("📋 **Plan Generated**\n- **Run**: `%s`\n- **Story**: %s\n\n---\n", runID, storyID)

	chunks := splitAtHeadings(planMD, 6000)
	if len(chunks) <= 1 {
		w.Notify(header + planMD)
		return
	}

	w.Notify(header + chunks[0])
	for _, chunk := range chunks[1:] {
		w.Notify(chunk)
	}
}

// splitAtHeadings splits md into chunks no larger than maxBytes, breaking at
// markdown heading lines (# or ##). The original text is sliced, not rebuilt,
// so formatting is preserved exactly.
func splitAtHeadings(md string, maxBytes int) []string {
	if len(md) <= maxBytes {
		return []string{md}
	}

	// Find byte offsets of each heading line
	var offsets []int
	pos := 0
	for pos < len(md) {
		nl := strings.Index(md[pos:], "\n")
		var lineStart int
		if pos == 0 {
			lineStart = 0
		} else {
			lineStart = pos
		}
		line := ""
		if nl == -1 {
			line = md[pos:]
			pos = len(md)
		} else {
			line = md[pos : pos+nl]
			pos = pos + nl + 1
		}
		if strings.HasPrefix(line, "# ") || strings.HasPrefix(line, "## ") {
			offsets = append(offsets, lineStart)
		}
	}

	// If no headings found, just return the whole thing
	if len(offsets) == 0 {
		return []string{md}
	}

	// Build chunks by grouping sections until maxBytes is exceeded
	var chunks []string
	start := 0
	lastSplit := 0
	for i, off := range offsets {
		// Check if adding this section would exceed the limit
		if i > 0 && off-start > maxBytes {
			chunks = append(chunks, md[start:lastSplit])
			start = lastSplit
		}
		lastSplit = off
	}
	// Remaining text
	if start < len(md) {
		chunks = append(chunks, md[start:])
	}
	return chunks
}

// NotifyPlanReady notifies that a plan is ready for review (awaiting manual approval).
func (w *WebexNotifier) NotifyPlanReady(runID, storyID string) {
	w.Notify(fmt.Sprintf("⏳ **Awaiting Approval**\n- **Run**: `%s`\n- **Story**: %s\n\nPlease review the plan above and approve or reject.", runID, storyID))
}

// NotifyPlanAutoApproved notifies that a plan was auto-approved.
func (w *WebexNotifier) NotifyPlanAutoApproved(runID, storyID string) {
	w.Notify(fmt.Sprintf("✅ **Plan Auto-Approved**\n- **Run**: `%s`\n- **Story**: %s\n\nAuto-approve is enabled. Proceeding to execution.", runID, storyID))
}

// NotifyExecutionStarted notifies that execution has begun.
func (w *WebexNotifier) NotifyExecutionStarted(runID, storyID, agent string) {
	w.Notify(fmt.Sprintf("⚙️ **Execution Started**\n- **Run**: `%s`\n- **Story**: %s\n- **Agent**: %s", runID, storyID, agent))
}

// NotifyExecutionDone notifies that execution completed successfully.
func (w *WebexNotifier) NotifyExecutionDone(runID, storyID string, changedFiles int, durationSec float64) {
	w.Notify(fmt.Sprintf("✅ **Execution Complete**\n- **Run**: `%s`\n- **Story**: %s\n- **Changed Files**: %d\n- **Duration**: %.0fs", runID, storyID, changedFiles, durationSec))
}

// NotifyExecutionFailed notifies that execution failed.
func (w *WebexNotifier) NotifyExecutionFailed(runID, storyID, errMsg string) {
	w.Notify(fmt.Sprintf("❌ **Execution Failed**\n- **Run**: `%s`\n- **Story**: %s\n- **Error**: %s", runID, storyID, errMsg))
}

// NotifyRunAborted notifies that a run was manually aborted.
func (w *WebexNotifier) NotifyRunAborted(runID, storyID string) {
	w.Notify(fmt.Sprintf("🛑 **Run Aborted**\n- **Run**: `%s`\n- **Story**: %s", runID, storyID))
}
