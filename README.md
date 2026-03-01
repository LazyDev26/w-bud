# w-bud (Work Buddy)

A local-first, AI-powered developer orchestrator that connects your JIRA sprint board, local git repositories, and CLI-based coding agents into one automated plan-and-execute workflow.

**Built to give you a headstart.** Instead of building your own AI-assisted dev pipeline from scratch, w-bud provides the wiring — JIRA integration, agent orchestration, worktree isolation, live streaming, and a ready-to-use dashboard. Fork it, customize it, and make it yours.

## Who Is This For?

- **Solo developers** who want to automate repetitive implementation work from their sprint backlog
- **Small teams** experimenting with AI coding agents and looking for a structured workflow around them
- **Tinkerers** who want a working reference for integrating JIRA + Git + AI agents into a local tool

If you use JIRA for sprint planning and any of the supported AI coding agents (Cursor, Codex, Copilot), w-bud lets you go from "story in backlog" to "code in a branch" with minimal friction.

## How It Works

1. **Pull stories** from your JIRA sprint — active or future sprints, your choice
2. **Select one or more stories** — batch multiple related stories into a single run
3. **Pick target repos**, add context and constraints — the more descriptive and clear you are here, the better the agent output. Think of it as writing a brief for a developer: include what to change, why, edge cases, and anything the agent should know about the codebase.
4. **A planning agent** analyzes the codebase and generates a markdown implementation plan
5. **Review & approve** the plan (or enable auto-approve)
6. **An execution agent** implements the changes in isolated git worktrees
7. **Review the diff**, merge or discard

Live logs stream via WebSocket throughout the pipeline. Optionally, connect a **Webex room** to receive notifications when plans are ready, executions complete, or runs fail — useful when you kick off a run and step away.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19, TypeScript, Vite 7, Tailwind CSS v4, React Router v7 |
| **Backend** | Go 1.25, chi router, gorilla/websocket |
| **AI Agents** | Cursor CLI (`agent`), OpenAI Codex CLI (`codex`), GitHub Copilot CLI (`copilot`) |
| **Storage** | JSON flat files — no database required |
| **Integrations** | JIRA Agile REST API, Webex Messages API |
| **Real-time** | WebSocket log streaming with pub/sub broker |
| **Version Control** | Git worktrees for branch isolation per run |

---

## Quick Start

### Prerequisites

- **Go** 1.25+ ([go.dev](https://go.dev/dl/))
- **Node.js** 20+ and **npm** ([nodejs.org](https://nodejs.org/))
- **Git** (for worktree management)
- At least one AI agent CLI installed and on `$PATH`:
  - **Cursor**: `agent --version`
  - **Codex**: `codex --version`
  - **Copilot**: `copilot --version`
- **JIRA** Cloud or Server instance with an API token
- **Webex** bot token + room ID (optional, for notifications)

### 1. Clone & install

```bash
git clone <repo-url>
cd w-bud
cd frontend && npm install && cd ..
```

### 2. Initialize data

```bash
./scripts/setup.sh
```

This creates the `data/` directory with empty config, stories, runs, repos, and locks files. The `data/` directory is gitignored — it lives only on your machine.

### 3. Start

```bash
./scripts/startup.sh
```

Backend starts on `:8000`, frontend on `:3000`. Press `Ctrl+C` to stop both.

Or start them separately:

```bash
cd backend && go run main.go    # :8000
cd frontend && npm run dev       # :3000
```

### 4. Configure

Open [http://localhost:3000](http://localhost:3000) — a welcome checklist will guide you through the required setup:

1. **JIRA** — Base URL, email, API token, board ID
2. **Workspace root** — A directory on your machine where w-bud creates git worktrees for each run (e.g., `~/workspaces`). This is **not** where your original repos live — it's a separate scratch area. Each run gets its own isolated worktree inside this directory so your actual repositories are never modified directly.
3. **Agents** — Select planning and execution agents (the UI checks CLI availability in real time)

Optional (can be configured later):
- **Global Prompts** — Reusable instructions injected into agent prompts, tagged per phase
- **Webex Notifications** — Bot token + room ID for run status alerts

---

## Customizing JIRA Fields

The JIRA client fetches standard fields plus two custom fields that map to a typical JIRA Cloud setup:

| Field | Custom Field ID | Used For |
|-------|----------------|----------|
| **Story Points** | `customfield_10026` | Display in sprint board |
| **Acceptance Criteria** | `customfield_10038` | Included in agent prompts |

**Your board likely uses different custom field IDs.** To change them, edit `backend/jira/client.go`:

- Update the `issueFields` struct tags (e.g., `customfield_10026` → your field ID)
- Update the `fields` query parameter in `GetSprintStories`

You can find your custom field IDs in JIRA under **Settings → Issues → Custom Fields**, or by inspecting the JIRA REST API response for any issue.

---

## Project Structure

```
w-bud/
├── data/                        # Runtime data (gitignored, created by setup.sh)
│   ├── logs/                    # Run log files and prompt dumps
│   ├── config.json              # App configuration
│   ├── repos.json               # Registered repositories
│   ├── stories.json             # Cached sprint stories
│   ├── runs.json                # Run history
│   └── locks.json               # Repo concurrency locks
│
├── backend/
│   ├── main.go                  # Entry point, router, lock reconciliation
│   ├── agents/
│   │   ├── agent.go             # Agent interface, NewAgent factory
│   │   ├── cursor.go            # Cursor CLI wrapper
│   │   ├── codex.go             # OpenAI Codex CLI wrapper
│   │   ├── copilot.go           # GitHub Copilot CLI wrapper
│   │   └── helpers.go           # Shared CLI helpers (temp prompt, exec & capture)
│   ├── broker/
│   │   └── broker.go            # LogBroker pub/sub + BrokerWriter (deadlock-safe)
│   ├── git/
│   │   └── worktree.go          # Git worktree setup & cleanup per run
│   ├── handlers/
│   │   ├── stories.go           # Story endpoints + JIRA sync
│   │   ├── runs.go              # Run CRUD (thin handlers, delegates to pipeline)
│   │   ├── repos.go             # Repo registry CRUD + validation
│   │   ├── config.go            # Config CRUD + agent CLI check
│   │   ├── browse.go            # Filesystem browser for workspace selection
│   │   ├── ws.go                # WebSocket handler for live log streaming
│   │   └── helpers.go           # JSON response writer
│   ├── jira/
│   │   └── client.go            # JIRA Agile API client (sprints, stories, ADF parsing)
│   ├── models/
│   │   ├── config.go            # Config, JIRA, Webex, Agents structs
│   │   ├── repo.go              # Repo struct (incl. per-repo prompt)
│   │   ├── run.go               # Run, RunsFile, LocksFile structs
│   │   ├── story.go             # Story, Subtask, StoriesFile structs
│   │   └── requests.go          # API request/response types
│   ├── notify/
│   │   └── webex.go             # Webex notification sender
│   ├── pipeline/
│   │   ├── runner.go            # Run lifecycle orchestration (planning + execution)
│   │   └── prompt.go            # Planning & execution prompt builders
│   └── storage/
│       ├── json_store.go        # Thread-safe JSON file storage
│       └── reconcile.go         # Stale lock cleanup on startup
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx              # Routes
│   │   ├── main.tsx             # React entry
│   │   ├── index.css            # Tailwind + custom theme
│   │   ├── api/client.ts        # Typed API client
│   │   ├── types/index.ts       # TypeScript interfaces
│   │   ├── components/
│   │   │   ├── layout/          # Layout shell + sidebar
│   │   │   └── common/          # Breadcrumbs, agent icons
│   │   └── pages/
│   │       ├── SprintBoard.tsx      # Sprint overview, story selection, run panel
│   │       ├── StoryContext.tsx      # Run config, prompt preview
│   │       ├── ExecutionMonitor.tsx  # Live terminal, plan review, diff viewer
│   │       ├── RepoRegistry.tsx     # Repo management
│   │       ├── RunHistory.tsx       # Filterable run history
│   │       └── Settings.tsx         # Full config UI with agent checks
│   └── vite.config.ts           # Dev server + API proxy
│
├── scripts/
│   ├── setup.sh                 # Initialize data/ directory (run once after clone)
│   ├── startup.sh               # Start backend + frontend
│   ├── soft-reset.sh            # Clear stories, runs, locks (keep config & repos)
│   └── hard-reset.sh            # Clear ALL data to empty defaults
│
├── mockups/                     # UI design references
└── PRD.md                       # Product requirements document
```

---

## UI Pages

| Page | Route | Purpose |
|------|-------|---------|
| **Sprint Board** | `/` | View sprint stories, select stories, see active/recent runs |
| **Story Context** | `/story/:storyId` | Select repos, add context/constraints, preview prompt, start run |
| **Execution Monitor** | `/run/:runId` | Live logs, plan review, approve/reject, diff viewer |
| **Repo Registry** | `/repos` | Register local git repos, validate paths, browse filesystem |
| **Run History** | `/history` | Search and filter all runs by status, story, or agent |
| **Settings** | `/settings` | JIRA, agents, workspace root, global prompts, Webex |

---

## Repos & Worktrees

w-bud never modifies your original repositories directly. Here's how it works:

1. **Register repos** — Add your local git repositories in the Repo Registry (`/repos`). These are just pointers to your existing clones.
2. **Worktree isolation** — When a run starts, w-bud creates a [git worktree](https://git-scm.com/docs/git-worktree) for each selected repo inside your configured workspace root. This is a lightweight checkout on a new feature branch — your original repo and branch stay untouched.
3. **Feature branch** — Each run gets its own branch (e.g., `wbud/STORY-123`). The agent works exclusively in the worktree. You can inspect, merge, or delete the branch after the run.
4. **Multi-repo runs** — If a story spans multiple services or packages, select all relevant repos when creating the run. The agent receives context about all repos and their worktree paths, and executes against each one.

After a run completes, you review the diff in the UI. If you're happy, merge the feature branch into your main branch using your normal git workflow. If not, discard it — nothing in your original repo was touched.

### Repository Prompts

Each registered repo can have an optional **prompt** — free-text instructions specific to that codebase. Examples:

- *"This is a Go microservice using chi router. Always run `go vet` after changes."*
- *"React 19 + Tailwind v4 frontend. Use functional components with hooks only."*
- *"Monorepo — only modify packages under `packages/core/`."*

Repo prompts are configured in the Repo Registry page (click the document icon on any repo row, or set it when adding/editing a repo).

When a run includes repos that have prompts, a **"Repository-Specific Instructions"** section is automatically added to both the planning and execution prompts. If no repos in the run have prompts, nothing is added — the prompt stays clean.

---

## Run Pipeline

```
[Create Run] → planning → awaiting_approval → executing → done
                  │              │                           │
                  │         (auto-approve)                   │
                  │              ↓                           │
                  │          executing ──────────────────→ done / failed
                  │
                  └─→ failed (agent error)

                  At any active stage → aborted (user abort)
```

1. **Planning** — Git worktrees are created per repo on a feature branch. The planning agent receives a structured prompt and returns a markdown plan. Logs are streamed back to the UI in real time via a WebSocket pub/sub broker (`broker/broker.go`), so you can watch agent output as it happens.
2. **Approval** — The plan is displayed for review. Edit, approve, or reject. Auto-approve can be enabled in settings.
3. **Execution** — The execution agent implements changes in the worktree. Logs continue streaming over the same WebSocket connection. Late subscribers (e.g., navigating back to the page) automatically receive the full history.
4. **Completion** — Changed files are detected via `git diff`, duration is recorded, and the run is marked done.

Repos are locked per-run to prevent concurrent modifications. Stale locks from crashed runs are cleaned up on backend startup.

---

## Supported Agents

| Agent | CLI Command | Planning | Execution | Version Check |
|-------|-------------|----------|-----------|---------------|
| **Cursor** | `agent` | Yes | Yes | `agent --version` |
| **Codex** | `codex` | Yes | Yes | `codex --version` |
| **Copilot** | `copilot` | Yes | Yes | `copilot --version` |

You can mix agents — e.g., Copilot for planning and Codex for execution. The Settings page shows real-time availability and version info. Unavailable agents are greyed out.

### Why CLI Agents?

w-bud uses **CLI-based coding agents** rather than API-only LLMs because CLI agents run locally against your actual filesystem. This means they can read, navigate, and understand one or more full repositories before making changes — not just a single file or snippet pasted into a prompt. When a run targets multiple repos, the agent has the complete codebase context of each one, which is critical for cross-repo changes like updating a shared API contract between a backend service and its frontend consumer.

### Agent Skills

If you want your agents to have additional capabilities or follow specific best practices, you can install **skills** from [skills.sh](https://skills.sh) at the global level for your agent. Skills are reusable instruction sets that get loaded into the agent's context at runtime — for example, `test-driven-development`, `react-native-best-practices`, or `systematic-debugging`. Install them with:

```bash
npx skills add <owner/skill-name>
```

Since w-bud delegates to CLI agents, any skills installed globally for that agent will automatically apply to all w-bud runs.

---

## API Reference

### Stories

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/stories` | Return cached sprint stories |
| `GET` | `/api/stories/sprints` | List active and future sprints |
| `GET` | `/api/stories/refresh` | Fetch latest from JIRA (`?sprint_id=` optional) |

### Runs

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/runs` | List all runs |
| `POST` | `/api/runs` | Create a run (triggers planning) |
| `GET` | `/api/runs/{runID}` | Get run details |
| `GET` | `/api/runs/{runID}/logs` | Get run log lines |
| `POST` | `/api/runs/{runID}/approve` | Approve plan, start execution |
| `POST` | `/api/runs/{runID}/abort` | Abort a run |
| `GET` | `/api/runs/{runID}/diff` | Git diff for changed files |
| `POST` | `/api/runs/preview-prompt` | Preview the planning prompt |

### Repos

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/repos` | List repos |
| `POST` | `/api/repos` | Register a repo |
| `PUT` | `/api/repos/{id}` | Update a repo |
| `DELETE` | `/api/repos/{id}` | Remove a repo |
| `POST` | `/api/repos/{id}/validate` | Validate path is a git directory |

### Config & Utilities

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/config` | Get configuration |
| `PUT` | `/api/config` | Update configuration |
| `GET` | `/api/config/check-agent?agent=` | Check agent CLI availability |
| `GET` | `/api/browse?path=` | Browse directories |
| `POST` | `/api/browse/mkdir` | Create a directory |

### WebSocket

| Endpoint | Description |
|----------|-------------|
| `ws://localhost:8000/ws/runs/{runID}` | Live log stream (`{type, message}` JSON frames) |

---

## Webex Notifications (Optional)

When configured, these events are pushed to your Webex room:

- **Planning Started** — Agent name, story details
- **Plan Generated** — Full plan in markdown
- **Awaiting Approval** / **Auto-Approved**
- **Execution Started / Complete / Failed** — With changed file count, duration, or error details

---

## Scripts

| Script | Description |
|--------|-------------|
| `./scripts/setup.sh` | Initialize `data/` directory with empty config files (run once after clone) |
| `./scripts/startup.sh` | Start backend + frontend; `Ctrl+C` stops both |
| `./scripts/soft-reset.sh` | Clear stories, runs, locks, and logs — keeps config & repos |
| `./scripts/hard-reset.sh` | Reset ALL data files to empty defaults |

---

## Limitations

- **Local-only** — Runs on a single developer's machine, not a shared server
- **No database** — JSON flat files under `data/`; not built for high-concurrency
- **Agents must be pre-installed** — w-bud wraps CLI agents, it doesn't install them
- **JIRA Cloud/Server** — Uses the Agile REST API; requires a personal API token
- **Git required** — Repos must be local git repositories
- **Single board** — One JIRA board at a time (configurable in settings)
- **No auth** — Local web UI with no authentication; intended for single-user use

---

## Contributing

Contributions are welcome. Some areas that could use help:

- Additional agent integrations (Claude CLI, etc.)
- Support for Linear, GitHub Issues, or other project trackers
- Multi-board / multi-project support
- Persistent storage backend (SQLite, etc.)
- Support for configuring models and reasoning effort of the CLI agents
- Try enabling the w-bud with cloud agents(`codex cloud`, `agent --cloud`, `copilot -p "/delegate"`) to make w-bud accessible to from anywhere
- Enabling support for PR creation with the worktree created
- Update comments for JIRA stories
- Creation of sub-agents through CLI Agents and use them accordingly

---

## License

MIT
