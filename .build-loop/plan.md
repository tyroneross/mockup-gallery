# Plan — Mockup Review Sessions

Linked goal: `.build-loop/goal.md`
Status: **PROPOSED** — not started

## Executive summary

Introduce session-scoped review state. Eight tasks across five logical layers
(schema, migration, server, UI, commands). Roughly 60% of the work is
parallelizable. No new dependencies. Safe fallback: flat layout continues
working pre-migration.

## Layers at a glance

```
Layer 1: Schema              →  Layer 2: Migration  ←─┐
                                       ↓              │
Layer 3: Server routes  ←  Layer 2 output             │
       ↓                                              │
Layer 4: Client UI  ←  Layer 3 output                 │
       ↓                                              │
Layer 5: Commands + docs  ←  Layer 4 working          │
       ↓                                              │
Validation suite  ←─────────  depends on all layers ──┘
```

## Task breakdown

### Task 1 — Schema + JSON validators [Layer 1]
**Files created:**
- `src/schemas/session.schema.json` — session metadata shape
- `src/schemas/selections.schema.json` — per-session selections shape
- `src/schemas/state.schema.json` — top-level state pointer
- `src/lib/validate.mjs` — thin wrapper using lightweight AJV or hand-rolled

**Shape decisions:**
```json
// mockups/sessions/<slug>/session.json
{
  "slug": "2026-04-09-coach-screens",
  "name": "Coach screens review",
  "goal": "Decide on dashboard layout and session review UI",
  "createdAt": "2026-04-09T08:00:00Z",
  "updatedAt": "2026-04-11T22:58:42Z",
  "status": "active | decided | stale | superseded",
  "tags": ["coach", "dashboard"],
  "supersededBy": null,
  "decision": { "file": "02-skills-dashboard.html", "decidedAt": "..." } | null
}
```

```json
// .mockup-gallery/sessions/<slug>/selections.json — SAME shape as today
// per-session; no changes to entry structure
```

```json
// .mockup-gallery/state.json
{
  "version": 2,
  "currentSession": "2026-04-09-coach-screens",
  "migratedFrom": "flat | null",
  "migratedAt": "..."
}
```

**Dependencies:** none. Can start immediately.
**Parallel-safe:** yes (independent file).
**Estimated surface:** ~150 LOC.

### Task 2 — Migration logic [Layer 2]
**Files created:**
- `src/lib/migrate-flat-to-sessions.mjs` — one-shot migration function
- `src/lib/migrate-flat-to-sessions.test.mjs` — test against fixture

**What it does:**
Given a project with flat `mockups/` + existing `.mockup-gallery/selections.json`:
1. Create `mockups/sessions/legacy-<timestamp>/` directory
2. Move all HTML files from `mockups/` into that session folder
3. Move `mockups/archive/*` into `mockups/sessions/legacy-<timestamp>/archive/`
4. Move `mockups/selected/*` into `mockups/sessions/legacy-<timestamp>/selected/`
5. Generate `session.json` with `slug: "legacy-<timestamp>"`, `name: "Pre-session layout"`, `status: "active"`
6. Split existing `.mockup-gallery/selections.json` into per-session state under `.mockup-gallery/sessions/legacy-<timestamp>/selections.json`
7. Write `.mockup-gallery/state.json` with `currentSession` pointing at the new session and `migratedFrom: "flat"`

**Dependencies:** Task 1 (schemas for validation).
**Parallel-safe:** partial — can write code in parallel with Task 1 but tests block on schemas.
**Estimated surface:** ~200 LOC + 100 LOC tests.

### Task 3 — Server routes [Layer 3]
**Files modified:** `server/gallery-server.mjs`
**Files created:** `src/lib/session-store.mjs` (abstraction over session filesystem operations)

**New routes:**
- `GET  /sessions` — list all sessions with metadata
- `GET  /session/<slug>` — session metadata
- `POST /session/switch` — update currentSession in state.json
- `POST /session/create` — create new session folder + metadata
- `POST /session/<slug>/status` — update status (active/decided/stale/superseded)
- `POST /session/<slug>/supersede` — mark as superseded by another session

**Routes that change behavior:**
- `GET  /mockups` — now filters to currentSession by default; accepts `?session=<slug>` override
- `GET  /selections` — same filtering
- `GET  /selected` — same filtering
- `POST /archive/<filename>` — operates within currentSession
- `POST /save` — writes to currentSession's selections

**Legacy compat:** If `.mockup-gallery/state.json` is missing AND no `mockups/sessions/` exists, server runs in legacy flat mode — returns a migration-required header on the first `/mockups` call, UI prompts user.

**Dependencies:** Task 1 (schemas), Task 2 (migration for auto-migrate-on-boot path).
**Parallel-safe:** can draft in parallel with Tasks 1 and 2 using stubbed types; integration requires them complete.
**Estimated surface:** ~300 LOC new + ~50 LOC modified.

### Task 4 — Client UI session switcher [Layer 4]
**Files modified:** `gallery/gallery.html`

**New components:**
- **Session switcher dropdown** in the header, left of the Save/Select/Confirm buttons
- **Session status badge** next to session name (active/decided/stale/superseded)
- **Session filter chips** above the sidebar (filter by status, filter by tag)
- **"New session" button** in the switcher dropdown

**State changes:**
- Add `currentSession` to top-level state
- Fetch list on load via `GET /sessions`
- Switching re-fetches mockups, selections, selected
- "New session" opens a modal with name/goal/tags inputs, calls `POST /session/create`, then switches

**UX rules (Calm Precision):**
- Switcher collapses to single-line pill showing current session name + status badge
- Dropdown shows all sessions grouped by status (active on top, stale/superseded at bottom)
- Default view is current session only — matches existing behavior so nothing changes for single-session users

**Dependencies:** Task 3 (server routes).
**Parallel-safe:** partial — HTML structure can be drafted in parallel; wire-up blocks on Task 3.
**Estimated surface:** ~250 LOC new HTML/JS + ~50 LOC CSS.

### Task 5 — Commands + skill docs [Layer 5]
**Files modified:**
- `commands/mockup-memories.md` — note session scoping
- `commands/mockup-feedback.md` — note session scoping
- `commands/mockup-sync.md` — update alignment check to include session schema
- `CLAUDE.md` — session lifecycle docs

**Files created:**
- `commands/mockup-session-list.md` — new command: list sessions
- `commands/mockup-session-new.md` — new command: create session
- `commands/mockup-session-archive.md` — new command: mark session as stale/superseded

**Dependencies:** Tasks 3, 4 complete.
**Parallel-safe:** all three command files can be drafted in parallel once server API is frozen.
**Estimated surface:** ~100 LOC docs + 3 × ~50 LOC command files.

### Task 6 — Test fixtures [supports all]
**Files created:**
- `test/fixtures/flat-unmigrated/mockups/*.html` — 3 sample mockups
- `test/fixtures/flat-unmigrated/.mockup-gallery/selections.json` — sample ratings
- `test/fixtures/flat-migrated/` — same project post-migration
- `test/fixtures/multi-session/mockups/sessions/*` — two sessions, both with ratings

**Dependencies:** Task 1 (schemas).
**Parallel-safe:** yes.
**Estimated surface:** ~30 files + small data.

### Task 7 — Integration tests + scorecard graders [validation]
**Files created:**
- `test/schema.test.mjs` → grader 1
- `test/migration.test.mjs` → grader 2
- `test/server-sessions.test.mjs` → grader 3
- `test/browser-switcher.test.mjs` → grader 4 (uses IBR or Playwright)
- `test/legacy-compat.test.mjs` → grader 5

**Dependencies:** all prior tasks.
**Parallel-safe:** test files can be drafted in parallel.
**Estimated surface:** ~400 LOC across 5 files.

### Task 8 — Validation run + scorecard + iterate
Execute all graders, collect evidence, write scorecard to
`.build-loop/evals/2026-04-xx-sessions-scorecard.md`. Iterate on failures up
to 5 times per Phase 6 rules.

## Dependency graph

```
Task 1 (schemas) ───┬──→ Task 2 (migration)
                    │
                    ├──→ Task 3 (server) ──→ Task 4 (UI) ──→ Task 5 (commands)
                    │
                    └──→ Task 6 (fixtures)
                                 │
                    Task 7 (tests) ←──── all above
                                 │
                    Task 8 (validate + iterate)
```

## Parallelization strategy

- **Wave 1** (parallel, no deps): Task 1, Task 6
- **Wave 2** (parallel, need Wave 1): Task 2, Task 3 draft
- **Wave 3** (serial, need Wave 2): Task 3 integration, Task 4, Task 5
- **Wave 4**: Task 7 tests, Task 8 validation

Dispatch subagents per task within each wave. Share reads done once: the
`gallery-server.mjs` file, the `gallery.html` file. Each subagent gets only
its task section from this plan plus the relevant schema files.

## Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| Migration corrupts existing ratings | **High** | Byte-compare selections arrays before/after as grader 2; dry-run flag for first pass |
| Gallery breaks for single-session users | **High** | Legacy compat mode (grader 5) + default behavior identical until user opts in |
| Session switcher UX is confusing | Medium | Load Calm Precision skill during Task 4, validate with IBR scan |
| Session slug collisions | Low | Auto-generate with timestamp; conflict detection in `POST /session/create` |
| File path escaping bugs (`../` in slug) | **Medium** | Whitelist slug chars to `[a-z0-9-]`, reject otherwise |

## Coordination checkpoints

- **After Task 1**: freeze the schema. All downstream tasks read the schema files as the contract. No schema changes after this point without rerunning Task 2 migration tests.
- **After Task 3**: freeze the server API. Task 4 and Task 5 consume it. Any API drift requires explicit re-sync.
- **Before Task 8**: dry-run grader 2 (migration) on real SpeakSavvy-iOS state in a worktree to catch edge cases the synthetic fixtures might miss.

## Not included in this plan (deferred)

- Session archiving to an external store (e.g., exporting a session as a tarball).
- Cross-project session sharing.
- AI-assisted session summarization ("what did we decide in this review").
- Automatic staleness detection based on activity heuristics — start with manual `status` field.
