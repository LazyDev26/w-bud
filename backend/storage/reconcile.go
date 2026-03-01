package storage

import "log"

// ReconcileLocks clears stale repo locks that reference runs no longer in an active state.
func ReconcileLocks(store *Store) {
	locks, err := store.GetLocks()
	if err != nil {
		log.Printf("Warning: could not read locks: %v", err)
		return
	}
	if len(locks) > 0 {
		runs, err := store.GetRuns()
		if err != nil {
			return
		}
		activeRuns := map[string]bool{}
		for _, run := range runs {
			if run.Status == "planning" || run.Status == "awaiting_approval" || run.Status == "executing" {
				activeRuns[run.RunID] = true
			}
		}
		cleaned := false
		for repo, runID := range locks {
			if !activeRuns[runID] {
				log.Printf("Clearing stale lock: repo=%s run=%s", repo, runID)
				delete(locks, repo)
				cleaned = true
			}
		}
		if cleaned {
			store.SaveLocks(locks)
		}
	}
	log.Println("Lock reconciliation complete")
}
