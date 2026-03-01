package main

import (
	"log"
	"net/http"
	"path/filepath"
	"runtime"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/w-bud/backend/broker"
	"github.com/w-bud/backend/handlers"
	"github.com/w-bud/backend/pipeline"
	"github.com/w-bud/backend/storage"
)

func main() {
	_, filename, _, _ := runtime.Caller(0)
	dataDir := filepath.Join(filepath.Dir(filename), "..", "data")

	store := storage.NewStore(dataDir)

	// Reconcile stale locks on startup
	storage.ReconcileLocks(store)

	logBroker := broker.NewLogBroker()
	runner := &pipeline.Runner{Store: store, LogBroker: logBroker}

	repoH := &handlers.RepoHandler{Store: store}
	storyH := &handlers.StoryHandler{Store: store}
	runH := &handlers.RunHandler{Store: store, Pipeline: runner}
	wsH := &handlers.WSHandler{Store: store, LogBroker: logBroker}
	cfgH := &handlers.ConfigHandler{Store: store}

	r := chi.NewRouter()

	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:5173"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
	}))

	// API routes
	r.Route("/api", func(r chi.Router) {
		// Stories
		r.Get("/stories", storyH.List)
		r.Get("/stories/sprints", storyH.ListSprints)
		r.Get("/stories/refresh", storyH.Refresh)

		// Runs
		r.Get("/runs", runH.List)
		r.Post("/runs", runH.Create)
		r.Get("/runs/{runID}", runH.Get)
		r.Get("/runs/{runID}/logs", runH.GetLogs)
		r.Post("/runs/{runID}/approve", runH.Approve)
		r.Post("/runs/{runID}/abort", runH.Abort)
		r.Get("/runs/{runID}/diff", runH.Diff)
		r.Post("/runs/preview-prompt", runH.PreviewPrompt)

		// Repos
		r.Get("/repos", repoH.List)
		r.Post("/repos", repoH.Create)
		r.Put("/repos/{id}", repoH.Update)
		r.Delete("/repos/{id}", repoH.Delete)
		r.Post("/repos/{id}/validate", repoH.Validate)

		// Browse filesystem
		r.Get("/browse", handlers.BrowseDirectories)
		r.Post("/browse/mkdir", handlers.CreateDirectory)

		// Config / Settings
		r.Get("/config", cfgH.Get)
		r.Put("/config", cfgH.Update)
		r.Get("/config/check-agent", cfgH.CheckAgent)
	})

	// WebSocket
	r.Get("/ws/runs/{runID}", wsH.StreamRun)

	log.Println("w-bud backend starting on :8000")
	if err := http.ListenAndServe(":8000", r); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
