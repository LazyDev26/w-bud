package handlers

import (
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
	"github.com/w-bud/backend/agents"
	"github.com/w-bud/backend/storage"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type WSHandler struct {
	Store     *storage.Store
	LogBroker *agents.LogBroker
}

func (h *WSHandler) StreamRun(w http.ResponseWriter, r *http.Request) {
	runID := chi.URLParam(r, "runID")
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}
	defer conn.Close()

	// Subscribe to live log output for this run
	ch := h.LogBroker.Subscribe(runID)
	defer h.LogBroker.Unsubscribe(runID, ch)

	// Also watch for run completion via polling
	done := make(chan struct{})
	go func() {
		for {
			time.Sleep(2 * time.Second)
			run, _ := h.Store.GetRun(runID)
			if run == nil {
				close(done)
				return
			}
			switch run.Status {
			case "done", "failed", "aborted":
				close(done)
				return
			}
		}
	}()

	for {
		select {
		case line, ok := <-ch:
			if !ok {
				// Channel closed — agent finished
				conn.WriteJSON(map[string]string{"type": "done", "message": "Stream ended"})
				return
			}
			msg := map[string]string{
				"type":    "output",
				"message": line,
			}
			if err := conn.WriteJSON(msg); err != nil {
				log.Printf("WebSocket write error: %v", err)
				return
			}
		case <-done:
			// Run reached terminal state
			run, _ := h.Store.GetRun(runID)
			status := "done"
			if run != nil {
				status = run.Status
			}
			conn.WriteJSON(map[string]string{"type": status, "message": "Run " + status})
			return
		}
	}
}
