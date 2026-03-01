package storage

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"

	"github.com/w-bud/backend/models"
)

type Store struct {
	dataDir string
	mu      sync.RWMutex
}

func NewStore(dataDir string) *Store {
	os.MkdirAll(dataDir, 0755)
	s := &Store{dataDir: dataDir}
	s.initDefaults()
	return s
}

func (s *Store) initDefaults() {
	// Initialize config.json if missing
	if _, err := os.Stat(s.path("config.json")); os.IsNotExist(err) {
		cfg := models.Config{
			JIRA: models.JIRAConfig{
				BaseURL:  "https://yourorg.atlassian.net",
				Email:    "you@yourorg.com",
				APIToken: "",
				BoardID:  "42",
			},
			Webex: models.WebexConfig{
				Token:  "",
				RoomID: "",
			},
			Agents: models.AgentsConfig{
				PlanningAgent:  "cursor",
				ExecutionAgent: "codex",
			},
			WorkspacesRoot: filepath.Join(os.Getenv("HOME"), "workspaces"),
		}
		s.writeJSON("config.json", cfg)
	}

	// Initialize repos.json if missing
	if _, err := os.Stat(s.path("repos.json")); os.IsNotExist(err) {
		s.writeJSON("repos.json", models.ReposFile{Repos: []models.Repo{}})
	}

	// Initialize stories.json if missing
	if _, err := os.Stat(s.path("stories.json")); os.IsNotExist(err) {
		s.writeJSON("stories.json", models.StoriesFile{Stories: []models.Story{}})
	}

	// Initialize runs.json if missing
	if _, err := os.Stat(s.path("runs.json")); os.IsNotExist(err) {
		s.writeJSON("runs.json", models.RunsFile{Runs: []models.Run{}})
	}

	// Initialize locks.json if missing
	if _, err := os.Stat(s.path("locks.json")); os.IsNotExist(err) {
		s.writeJSON("locks.json", models.LocksFile{Locks: map[string]string{}})
	}
}

func (s *Store) DataDir() string {
	return s.dataDir
}

func (s *Store) path(filename string) string {
	return filepath.Join(s.dataDir, filename)
}

func (s *Store) readJSON(filename string, v interface{}) error {
	data, err := os.ReadFile(s.path(filename))
	if err != nil {
		return err
	}
	return json.Unmarshal(data, v)
}

func (s *Store) writeJSON(filename string, v interface{}) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path(filename), data, 0644)
}

// Config

func (s *Store) GetConfig() (models.Config, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var cfg models.Config
	err := s.readJSON("config.json", &cfg)
	return cfg, err
}

func (s *Store) SaveConfig(cfg models.Config) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.writeJSON("config.json", cfg)
}

// Repos

func (s *Store) GetRepos() ([]models.Repo, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var f models.ReposFile
	err := s.readJSON("repos.json", &f)
	return f.Repos, err
}

func (s *Store) SaveRepos(repos []models.Repo) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.writeJSON("repos.json", models.ReposFile{Repos: repos})
}

// Stories

func (s *Store) GetStories() (models.StoriesFile, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var f models.StoriesFile
	err := s.readJSON("stories.json", &f)
	return f, err
}

func (s *Store) SaveStories(f models.StoriesFile) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.writeJSON("stories.json", f)
}

// Runs

func (s *Store) GetRuns() ([]models.Run, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var f models.RunsFile
	err := s.readJSON("runs.json", &f)
	return f.Runs, err
}

func (s *Store) SaveRuns(runs []models.Run) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.writeJSON("runs.json", models.RunsFile{Runs: runs})
}

func (s *Store) GetRun(runID string) (*models.Run, error) {
	runs, err := s.GetRuns()
	if err != nil {
		return nil, err
	}
	for i := range runs {
		if runs[i].RunID == runID {
			return &runs[i], nil
		}
	}
	return nil, nil
}

func (s *Store) UpdateRun(run models.Run) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	var f models.RunsFile
	if err := s.readJSON("runs.json", &f); err != nil {
		return err
	}
	for i := range f.Runs {
		if f.Runs[i].RunID == run.RunID {
			f.Runs[i] = run
			return s.writeJSON("runs.json", f)
		}
	}
	return nil
}

func (s *Store) AddRun(run models.Run) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	var f models.RunsFile
	if err := s.readJSON("runs.json", &f); err != nil {
		return err
	}
	f.Runs = append(f.Runs, run)
	return s.writeJSON("runs.json", f)
}

// Locks

func (s *Store) GetLocks() (map[string]string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var f models.LocksFile
	err := s.readJSON("locks.json", &f)
	if f.Locks == nil {
		f.Locks = map[string]string{}
	}
	return f.Locks, err
}

func (s *Store) SaveLocks(locks map[string]string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.writeJSON("locks.json", models.LocksFile{Locks: locks})
}
