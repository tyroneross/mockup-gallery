# mockup-gallery — Claude Code

See [COMMON.md](COMMON.md) for data formats, behavioral rules, and mockup conventions.

## Plugin Installation

```bash
claude plugin add /path/to/mockup-gallery
```

## Commands

| Command | Purpose |
|---------|---------|
| `/mockup-review` | Launch gallery server for the current project |
| `/mockup-status` | Show review progress inline |
| `/mockup-feedback` | Pull latest ratings, comments, selections (session-scoped) |
| `/mockup-selections` | Full structured output of all design decisions |
| `/mockup-memories` | Show global + project-specific design memories |
| `/mockup-memories promote` | Promote a learning to global or project memory |
| `/mockup-session-list` | List all review sessions for the current project |
| `/mockup-session-new` | Create a new review session and make it current |
| `/mockup-session-archive` | Archive a session as decided, stale, or superseded |
| `/mockup-gallery:sync` | Check alignment between COMMON.md, CLAUDE.md, AGENTS.md |

## Hooks

**SessionStart** — Surfaces:
- Review status (ratings, pending items, implementation progress)
- Pending design changes to implement
- Relevant global memories (design preferences, implementation lessons)

**UserPromptSubmit** — Delivers pending feedback from the gallery's "Share with Claude" button (one-shot, auto-deletes after reading).

**PostToolUse (Write|Edit)** — When editing mockup HTML files, surfaces relevant feedback for that specific mockup.

## Skills

**mockup-review** — Full design review workflow: creating mockups, reading feedback, iterating, consolidating approved designs. Load this skill before creating or implementing mockups.

## Memories

Global memories live in the plugin repo under `memories/`.

- `memories/global/design-preferences.md` — Cross-project visual rules
- `memories/global/implementation-lessons.md` — What worked/failed across projects
- `memories/projects/<name>/design-preferences.md` — Project-specific overrides

Use `/mockup-memories` to view. Use `/mockup-memories promote` to promote local learnings.

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

**Migration from flat layout.** Legacy projects with `mockups/*.html` at the root still work unchanged (`layout: "flat"`). The first time the user runs `/mockup-session-new`, the server prompts to migrate existing flat mockups into a starter session. Migration is non-destructive: files are moved, not copied-then-deleted, and the gallery rolls back if anything fails.

**Slash commands.** Use `/mockup-session-list` to see every session grouped by status, `/mockup-session-new` to create one, and `/mockup-session-archive` to retire one. Sessions are opt-in — if a project never creates one, it stays in flat mode forever and every existing command keeps working.
