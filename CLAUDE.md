# mockup-gallery — Claude Code

See [COMMON.md](COMMON.md) for data formats, behavioral rules, and mockup conventions.

## Plugin Installation

```bash
claude plugin add /path/to/mockup-gallery
```

## Commands

Use `/mockup-gallery` as the single slash command. It provides capability guidance and routes launch, feedback, session, memory, implementation handoff, and sync requests.

| Command | Purpose |
|---------|---------|
| `/mockup-gallery` | Main entry point: launch review, read state, manage sessions, prepare implementation handoff, or choose a capability |

## Data Files

Review state lives in `.mockup-gallery/`: `selections.json`, `selected.json`, `implemented.json`, and `accepted-designs.json`. Mockup HTML uses `data-component` attributes for component-level review. Selected page entries may include `changeNote`; when present, implement only that described change.

## Hooks

**SessionStart** — Surfaces:
- Review status (ratings, pending items, implementation progress)
- Pending design changes to implement
- Relevant global memories (design preferences, implementation lessons)

**UserPromptSubmit** — Delivers pending feedback from the gallery's "Share with Claude" button (one-shot, auto-deletes after reading).

**PostToolUse (Write|Edit)** — When editing mockup HTML files, surfaces relevant feedback for that specific mockup.

## Skills

**mockup-review** — Full design review workflow: creating mockups, reading feedback, iterating, consolidating approved designs. Load this skill before creating or implementing mockups.

## Implementation Handoff

Before implementing selected UI, use `/mockup-gallery implement` or `/mockup-gallery handoff`. Claude should read selected mockups, identify every changed UI element, classify each as static, dynamic, computed, user input, action, or unknown, and capture data sources, field paths, connector/API contracts, loading/empty/error states, visualizations, and unresolved questions before coding.

## Wireframe-First Toggle

The gallery exposes a `Lo-fi first` toggle in the sidebar, persisted at `.mockup-gallery/state.json#preferences.wireframeFirst`. It defaults to `true`, in which case every new review batch should start with a low-fidelity black-and-white scratch mockup before higher-fidelity variants. Name scratch files with a prefix such as `00-scratch-`, `01-scratch-`, `lo-fi-`, or `wireframe-` so the gallery prioritizes them first. When the toggle is `false`, the user has opted out — proceed directly to hi-fi HTML. Treat a missing `preferences` block as `wireframeFirst: true`.

Read the live value from `GET /preferences` when the gallery is running, or directly from `state.json` otherwise. The toggle is a default, not a hard block — honor an explicit one-off request to skip the scratch step without flipping the global toggle.

## Design System and Handoff Artifacts

This plugin emits two distinct implementation-handoff artifacts:

- **`DESIGN.md`** at the project root, in [Google's design-system format](https://github.com/google-labs-code/design.md), holds the visual identity (colors, typography, spacing, elevation, shape) as YAML tokens plus prose rationale. When present, treat its tokens as canonical for new mockups. Scaffold a starter via `POST /design-system/scaffold` (returns 409 if a `DESIGN.md` exists without `force: true`).
- **`.mockup-gallery/handoff/<route-slug>.md`** (or the session-scoped equivalent) is emitted on every `POST /selected`. Each file is a structured Markdown brief — frontmatter (`schema`, `route`, `source`, `selectedAt`, `status`, `filled`) plus body sections (Source, Components, Data Elements, Connectors / APIs, Visualizations, States, Open Questions). Fill it by reading the source mockup's `data-component` markup and flip `filled: true` when complete. Existing handoff files are preserved on re-emit; pass `regenerateHandoffs: true` to overwrite intentionally.

## Memories

Global memories live in the plugin repo under `memories/`.

- `memories/global/design-preferences.md` — Cross-project visual rules
- `memories/global/implementation-lessons.md` — What worked/failed across projects
- `memories/projects/<name>/design-preferences.md` — Project-specific overrides

Use `/mockup-gallery memories` to view. Use `/mockup-gallery promote memory` to promote local learnings.

Per-project memories override global when both address the same topic.

## Sessions

Sessions group mockup reviews into distinct, named batches — for example "app icons review" vs "coach screens review" — instead of dumping everything into one flat directory. Each session has its own mockups, its own ratings/comments, and its own status.

**Directory layout** (sessions mode):

```
mockups/
  sessions/
    <slug>/
      session.json       # name, goal, tags, status, created date
      *.html             # session's mockups
      archive/           # session's archived mockups
      selected/          # session's selected mockups
.mockup-gallery/
  state.json             # { version: 2, currentSession: "<slug>", migratedFrom, migratedAt }
  sessions/
    <slug>/
      selections.json    # ratings, comments, selections scoped to this session
      last-change.json
      selected.json
```

The current session pointer lives in `.mockup-gallery/state.json` under the
`currentSession` field. `session.json` for each session lives inside that
session's mockup folder, not inside `.mockup-gallery/`.

**Lifecycle.** Every session starts as `active`. When the review concludes, archive it as one of:
- `decided` — a choice was made, implementation can proceed
- `stale` — no longer relevant, abandoned without a decision
- `superseded` — replaced by a newer session (records the superseding slug)

**Migration from flat layout.** Legacy projects with `mockups/*.html` at the root still work unchanged (`layout: "flat"`). The first time the user creates a session through `/mockup-gallery`, the server prompts to migrate existing flat mockups into a starter session. Migration is non-destructive: files are moved, not copied-then-deleted, and the gallery rolls back if anything fails.

**Slash command.** Use `/mockup-gallery sessions` to see every session grouped by status, `/mockup-gallery new session` to create one, and `/mockup-gallery archive session` to retire one. Sessions are opt-in — if a project never creates one, it stays in flat mode forever.
