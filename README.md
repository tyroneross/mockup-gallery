# Mockup Gallery

A local design review tool for browsing, rating, and selecting HTML mockups. Works with any project — auto-detects Next.js routes, SwiftUI views, Python endpoints, and static pages.

## Quick Start

```bash
# From your project directory (must have a mockups/ folder with .html files)
npx mockup-gallery

# Or point to a specific project
npx mockup-gallery --project /path/to/project --dir mockups
```

The gallery opens at `http://localhost:8787` (auto-increments if busy). Each project gets a stable port based on its path, so multiple galleries can run simultaneously.

## Features

- **Rate mockups** — Yay/Nay with notes. Rated items stay in Active with color-coded dots.
- **Select for build** — Assign mockups to specific pages/screens. Auto-detects project routes.
- **Save for later** — Bookmark mockups without assigning them.
- **Component tracking** — Tag individual components within mockups.
- **Archive** — Move reviewed mockups out of the active flow.
- **Auto-placement** — Fuzzy-matches mockup filenames to detected routes and pre-selects.
- **Implementation tracking** — Track which components have been built.
- **Multi-project** — Run separate galleries for different projects simultaneously.
- **Wireframe-first toggle** — A sidebar toggle (default ON) that drives the host coding agent to begin new review batches with a lo-fi wireframe before hi-fi HTML variants. Persisted per-project at `.mockup-gallery/state.json#preferences.wireframeFirst`. Flip OFF to allow hi-fi directly.
- **Two implementation-handoff artifacts** — A project-root `DESIGN.md` in [Google's design-system format](https://github.com/google-labs-code/design.md) for visual identity (colors, typography, spacing, elevation, shape), AND per-route `.mockup-gallery/handoff/<slug>.md` files emitted on `/selected` for interaction / data / state / connector contracts. Scaffold the design system via `POST /design-system/scaffold`.

## Sidebar Layout

```
SELECTED       Top — mockups assigned to pages/screens
ACTIVE         Middle — all current mockups (yay/nay just marked, not moved)
SAVED          Below active — bookmarked for later reference
ARCHIVE        Bottom — reviewed and set aside
```

## Project Detection

The gallery auto-detects your project type and available pages/screens:

| Project Type | Detection | Route Source |
|-------------|-----------|-------------|
| Next.js App Router | `app/` dir with `page.tsx` | File-system routes |
| Next.js Pages | `pages/` dir | File-system routes |
| SwiftUI | `*View.swift` files | View names + platform tags |
| Python (Flask/FastAPI) | `@app.route` decorators | Decorated endpoints |
| Static | HTML files in `public/` | Filenames |

## CLI Options

```
--project <path>   Project root (default: cwd)
--dir <path>       Mockups directory (default: auto-detect mockups/, docs/mockups/, .claude/mockups/)
--port <number>    Starting port (default: stable hash of project path in 8787-8886 range)
```

## Claude Code Plugin

Install as a Claude Code plugin for session-start status and slash commands:

```bash
claude plugin add /path/to/mockup-gallery
```

Or add to `.claude/plugins.json`:

```json
{
  "plugins": [
    { "path": "/path/to/mockup-gallery" }
  ]
}
```

### Plugin Features

- **SessionStart hook** — Shows design review status (ratings, pending items, implementation progress)
- **`/mockup-gallery`** — Single Claude Code entry point for launch, status, feedback, sessions, selected-build handoff, implementation guidance, and sync checks
- **Implementation handoff guidance** — Before coding selected UI, Claude can use `/mockup-gallery implement` or `/mockup-gallery handoff` to map changed UI elements to static/dynamic data, actions, connectors, visualizations, and unresolved questions

## Data Storage

All data lives in `.mockup-gallery/` inside the project root:

```
.mockup-gallery/
  state.json            Top-level: schema version, currentSession, preferences (wireframeFirst, ...)
  selections.json       Ratings + notes (legacy flat layout)
  selected.json         Selected build (pages, components, saved) (legacy flat layout)
  implemented.json      Implementation tracking
  accepted-designs.json Approved design patterns
  handoff/              Per-route implementation handoff specs (Markdown) — written on /selected
  sessions/<slug>/      Sessions-mode equivalents of selections/selected/handoff
```

The project-root `DESIGN.md` (Google design-system format) lives alongside `package.json`, not under `.mockup-gallery/` — it is the visual-identity source of truth shared by mockup-gallery, ad-hoc design tools, and AI coding agents.

Add `.mockup-gallery/` to `.gitignore` if you don't want to track review state in version control.

## Mockup Directory Structure

```
mockups/
  01-homepage.html        Active mockups
  02-settings-page.html
  archive/                Archived mockups (moved via gallery UI)
    old-version.html
```

Mockups are plain HTML files — build them however you like. The gallery serves them in an iframe.

## Codex

This package ships an additive Codex plugin surface alongside the existing Claude Code package. The Claude package remains authoritative for Claude behavior; the Codex package adds a parallel `.codex-plugin/plugin.json` install surface without changing the Claude runtime.

Package root for Codex installs:
- the repository root (`.`)

Primary Codex surface:
- skills from `./skills/`
- MCP config from `(none)` when present

Codex can use the `mockup-review` skill to create scratch-first HTML mockups, optionally use image generation for local visual assets when it materially improves review quality, launch the gallery, read selected state, and implement approved designs.

Install the package from this package root using your current Codex plugin install flow. The Codex package is additive only: Claude-specific hooks, slash commands, and agent wiring remain unchanged for Claude Code.
