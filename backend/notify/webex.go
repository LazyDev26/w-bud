package notify

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"

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

// NotifyPlanGenerated sends the generated plan to Webex as a standalone message.
// This is always sent before any approval decision.
func (w *WebexNotifier) NotifyPlanGenerated(runID, storyID, planMD string) {
	w.Notify(fmt.Sprintf("📋 **Plan Generated**\n- **Run**: `%s`\n- **Story**: %s\n\n---\n%s", runID, storyID, planMD))
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
