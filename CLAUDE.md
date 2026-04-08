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
| `/mockup-feedback` | Pull latest ratings, comments, selections |
| `/mockup-selections` | Full structured output of all design decisions |
| `/mockup-memories` | Show global + project-specific design memories |
| `/mockup-memories promote` | Promote a learning to global or project memory |
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
