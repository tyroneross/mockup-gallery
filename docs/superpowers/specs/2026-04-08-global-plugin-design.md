# mockup-gallery — Global Plugin Design

**Date:** 2026-04-08
**Status:** Draft

## Goal

Make mockup-gallery installable as a global Claude Code plugin and compatible with Codex/Cursor/Copilot via AGENTS.md. Mockups live in project repos. Review data lives in project `.mockup-gallery/` folders. Global memories and a project registry live in the gallery repo. CLAUDE.md and AGENTS.md are separate living documents aligned through a shared COMMON.md.

## Architecture

```
mockup-gallery repo (central install)
├── plugin.json                ← Claude Code plugin manifest
├── package.json               ← bin entry for npx/global install
├── COMMON.md                  ← Shared rules: data schema, behavioral conventions, mockup format
├── CLAUDE.md                  ← Claude Code specifics (references COMMON.md)
├── AGENTS.md                  ← Codex/Cursor/Copilot specifics (references COMMON.md)
├── registry.json              ← Auto-populated project index
├── memories/
│   ├── global/                ← Cross-project design prefs, implementation lessons
│   │   ├── design-preferences.md
│   │   └── implementation-lessons.md
│   └── projects/
│       └── <project-name>/    ← Per-project memory overrides
│           └── design-preferences.md
├── server/gallery-server.mjs
├── gallery/gallery.html
├── hooks/
├── commands/
└── sync/                      ← Alignment check tooling

Consumer project (e.g. atomize-ai)
├── .mockup-gallery/           ← Local review data (portable, any agent reads this)
│   ├── selections.json
│   ├── selected.json
│   ├── implemented.json
│   └── accepted-designs.json
└── mockups/                   ← HTML mockup files
```

## Components

### 1. Registry (`registry.json`)

Auto-populated when the gallery server or hooks run against a project.

```json
{
  "projects": {
    "atomize-ai": {
      "path": "/Users/tyroneross/Desktop/git-folder/atomize-ai",
      "lastSeen": "2026-04-08T12:00:00Z"
    }
  }
}
```

**Behavior:**
- Hooks auto-register current project on SessionStart (silent, no output)
- Project name = directory basename of `process.cwd()`
- `lastSeen` updated on each hook invocation
- Gallery server reads registry to offer project switching

### 2. Memories

Two tiers:

**Global (`memories/global/`)** — Design preferences and implementation lessons that apply everywhere. Markdown files, readable by any agent.

- `design-preferences.md` — Visual rules, color palettes, spacing, component patterns
- `implementation-lessons.md` — What worked/failed in production across projects

**Per-project (`memories/projects/<name>/`)** — Overrides or additions specific to one project.

- Same file structure as global
- Per-project takes precedence over global when both exist

**Promotion flow:**
- Learnings start local (in the project's `.mockup-gallery/` via notes/comments)
- User decides what to promote via `/mockup-memories promote` command
- Promoted to per-project or global based on user choice

**No auto-promotion.** Memories are only promoted by explicit user action.

### 3. COMMON.md — Shared Contract

The single source of truth for what any agent (Claude Code, Codex, Cursor, Copilot) needs to agree on when working with mockup-gallery data.

**Contents:**
- `.mockup-gallery/` data schema (all JSON file formats with field definitions)
- Behavioral rules (don't override approved patterns, version mockups don't overwrite, etc.)
- Mockup format conventions (`data-component` attributes, self-contained HTML, labeling)
- Rating semantics (yay = ship, nay = don't reuse, unrated = needs review)
- Implementation workflow (read selections before implementing, respect accepted designs)

**What COMMON.md does NOT contain:**
- Platform-specific instructions (hooks, commands, plugin install)
- How to invoke tools or commands
- Agent-specific behavioral guidance

### 4. CLAUDE.md

Claude Code-specific guidance. References COMMON.md for shared rules.

**Contents:**
- Plugin installation instructions (`claude plugin add`)
- Available hooks and their behavior
- Slash commands (`/mockup-review`, `/mockup-status`, `/mockup-feedback`, `/mockup-memories`)
- Skills (`mockup-review` skill for creating mockups)
- How hooks surface feedback (SessionStart status, PostToolUse nudges, UserPromptSubmit delivery)
- Memory commands and promotion workflow

**Structure:**
```markdown
# mockup-gallery — Claude Code

See [COMMON.md](COMMON.md) for data formats, behavioral rules, and mockup conventions.

## Plugin Features
...
```

### 5. AGENTS.md

Guidance for Codex, Cursor, Copilot, and other LLM coding agents.

**Contents:**
- How to find `.mockup-gallery/` in the project
- How to read each JSON file and interpret the data
- Behavioral rules (via reference to COMMON.md)
- How to create mockups that work with the gallery
- No plugin dependency — pure filesystem interaction

**Structure:**
```markdown
# mockup-gallery

See [COMMON.md](COMMON.md) for data formats, behavioral rules, and mockup conventions.

## For Coding Agents
...
```

### 6. Sync Check (`sync/`)

A command or script that reads COMMON.md, CLAUDE.md, and AGENTS.md, then identifies drift.

**What it checks:**
- Rules in COMMON.md that aren't reflected in either platform doc
- Platform docs that contradict COMMON.md
- Platform docs that have drifted from each other on shared concepts (e.g., different descriptions of the same data format)

**Invocation:**
- `/mockup-gallery:sync` command in Claude Code
- Can also run as `node sync/check-alignment.mjs` for any agent

**Output:** Structured list of gaps/contradictions. Each item: which doc, what's missing or conflicting, and the relevant COMMON.md section. Does not auto-fix — surfaces issues for human decision.

**Frequency:** Periodic — run after editing any of the three docs, or on demand.

### 7. Hook Changes

Existing hooks keep `process.cwd()` for `.mockup-gallery/` data. Additions:

**SessionStart (`check-pending.mjs`):**
- Existing: surface review status
- Add: auto-register project in `registry.json` via `CLAUDE_PLUGIN_ROOT`
- Add: surface relevant global memories (read `memories/global/` + `memories/projects/<name>/`)

**UserPromptSubmit (`check-shared-feedback.mjs`):**
- No changes — reads local `pending-review.json` as before

**PostToolUse (`check-after-mockup-edit.mjs`):**
- No changes — reads local `selections.json` as before

### 8. New Command: `mockup-memories`

```markdown
/mockup-memories          — Show global + project-specific memories
/mockup-memories promote  — Promote a learning to global or project memory
```

Reads from `CLAUDE_PLUGIN_ROOT/memories/` and formats for Claude Code context.

### 9. Plugin Installation

```bash
# Global install for Claude Code
claude plugin add /Users/tyroneross/Desktop/git-folder/mockup-gallery

# Or from any project
claude plugin add --global mockup-gallery
```

The plugin uses `CLAUDE_PLUGIN_ROOT` to resolve its own directory for registry and memories. Uses `process.cwd()` to resolve the consumer project's `.mockup-gallery/` data.

### 10. Codex Compatibility

Codex reads AGENTS.md at repo root. It interacts with `.mockup-gallery/` via direct filesystem reads/writes. No plugin system needed.

**Both Claude Code and Codex see the same `.mockup-gallery/` folder and write to the same location.** The data format is the shared interface, documented in COMMON.md.

## What Changes vs. Today

| Area | Current | New |
|------|---------|-----|
| Hook paths | `process.cwd()` only | + `CLAUDE_PLUGIN_ROOT` for registry/memories |
| Registry | None | `registry.json` auto-populated |
| Memories | None | `memories/global/` + `memories/projects/<name>/` |
| COMMON.md | None | Shared contract for all agents |
| CLAUDE.md | None (implicit via plugin) | Explicit Claude Code guidance |
| AGENTS.md | None | Codex/Cursor/Copilot guidance |
| Sync check | None | `sync/check-alignment.mjs` |
| Commands | 1 (`mockup-feedback`) | + `mockup-memories` |
| Plugin install | Local path only | Global via `claude plugin add` |

## What Doesn't Change

- `.mockup-gallery/` stays in each consumer project (portable)
- Gallery server stays a dev tool, not infrastructure
- Mockups stay in project repos
- All existing hook behavior preserved
- Review history stays local/ephemeral
- No auto-promotion of memories

## Resolved Decisions

- **Sync check output:** Suggests patches to both CLAUDE.md and AGENTS.md when drift is detected.
- **registry.json:** Gitignored. Paths are machine-specific. Auto-populated at runtime.
- **memories/global/:** Git-tracked in the mockup-gallery plugin repo. Design preferences and implementation lessons are version-worthy.
- **memories/projects/<name>/:** Git-tracked in the mockup-gallery plugin repo. Per-project memories specific to each registered project.
