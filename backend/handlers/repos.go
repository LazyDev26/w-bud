package handlers

import (
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/w-bud/backend/models"
	"github.com/w-bud/backend/storage"
)

type RepoHandler struct {
	Store *storage.Store
}

func (h *RepoHandler) List(w http.ResponseWriter, r *http.Request) {
	repos, err := h.Store.GetRepos()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, repos)
}

func (h *RepoHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req models.CreateRepoRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if req.Name == "" || req.Path == "" {
		http.Error(w, "Name and path are required", http.StatusBadRequest)
		return
	}

	valid := validateRepoPath(req.Path)

	repo := models.Repo{
		ID:            uuid.New().String()[:8],
		Name:          req.Name,
		Path:          req.Path,
		Prompt:        req.Prompt,
		Valid:         valid,
		LastValidated: time.Now(),
	}

	repos, err := h.Store.GetRepos()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	repos = append(repos, repo)
	if err := h.Store.SaveRepos(repos); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	writeJSON(w, repo)
}

func (h *RepoHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req models.UpdateRepoRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	repos, err := h.Store.GetRepos()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	found := false
	for i := range repos {
		if repos[i].ID == id {
			if req.Name != "" {
				repos[i].Name = req.Name
			}
			if req.Path != "" {
				repos[i].Path = req.Path
				repos[i].Valid = validateRepoPath(req.Path)
				repos[i].LastValidated = time.Now()
			}
			repos[i].Prompt = req.Prompt
			found = true
			if err := h.Store.SaveRepos(repos); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			writeJSON(w, repos[i])
			return
		}
	}

	if !found {
		http.Error(w, "Repo not found", http.StatusNotFound)
	}
}

func (h *RepoHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	repos, err := h.Store.GetRepos()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	filtered := make([]models.Repo, 0, len(repos))
	found := false
	for _, repo := range repos {
		if repo.ID == id {
			found = true
			continue
		}
		filtered = append(filtered, repo)
	}

	if !found {
		http.Error(w, "Repo not found", http.StatusNotFound)
		return
	}

	if err := h.Store.SaveRepos(filtered); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *RepoHandler) Validate(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	repos, err := h.Store.GetRepos()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	for i := range repos {
		if repos[i].ID == id {
			repos[i].Valid = validateRepoPath(repos[i].Path)
			repos[i].LastValidated = time.Now()
			if err := h.Store.SaveRepos(repos); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			writeJSON(w, repos[i])
			return
		}
	}

	http.Error(w, "Repo not found", http.StatusNotFound)
}

func validateRepoPath(path string) bool {
	info, err := os.Stat(path)
	if err != nil || !info.IsDir() {
		return false
	}
	cmd := exec.Command("git", "-C", path, "rev-parse", "--is-bare-repository")
	out, err := cmd.Output()
	if err != nil {
		return false
	}
	return string(out) == "false\n"
}
