package handlers

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
)

type DirEntry struct {
	Name  string `json:"name"`
	Path  string `json:"path"`
	IsGit bool   `json:"is_git"`
}

type BrowseResponse struct {
	Current string     `json:"current"`
	Parent  string     `json:"parent"`
	Entries []DirEntry `json:"entries"`
}

func CreateDirectory(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Path == "" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]string{"error": "path is required"})
		return
	}
	if err := os.MkdirAll(req.Path, 0755); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		writeJSON(w, map[string]string{"error": "Failed to create directory: " + err.Error()})
		return
	}
	writeJSON(w, map[string]string{"path": req.Path})
}

func BrowseDirectories(w http.ResponseWriter, r *http.Request) {
	dir := r.URL.Query().Get("path")
	if dir == "" {
		if runtime.GOOS == "darwin" || runtime.GOOS == "linux" {
			home, err := os.UserHomeDir()
			if err != nil {
				dir = "/"
			} else {
				dir = home
			}
		} else {
			dir = "C:\\"
		}
	}

	// Resolve to absolute
	abs, err := filepath.Abs(dir)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]string{"error": "Invalid path"})
		return
	}
	dir = abs

	// Check directory exists
	info, err := os.Stat(dir)
	if err != nil || !info.IsDir() {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, map[string]string{"error": "Not a directory"})
		return
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		writeJSON(w, map[string]string{"error": "Cannot read directory"})
		return
	}

	var dirs []DirEntry
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		name := e.Name()
		// Skip hidden directories
		if strings.HasPrefix(name, ".") {
			continue
		}
		fullPath := filepath.Join(dir, name)
		isGit := false
		if gitDir, err := os.Stat(filepath.Join(fullPath, ".git")); err == nil && gitDir.IsDir() {
			isGit = true
		}
		dirs = append(dirs, DirEntry{
			Name:  name,
			Path:  fullPath,
			IsGit: isGit,
		})
	}

	sort.Slice(dirs, func(i, j int) bool {
		return strings.ToLower(dirs[i].Name) < strings.ToLower(dirs[j].Name)
	})

	parent := filepath.Dir(dir)
	if parent == dir {
		parent = ""
	}

	writeJSON(w, BrowseResponse{
		Current: dir,
		Parent:  parent,
		Entries: dirs,
	})
}
