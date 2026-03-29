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
- **`/mockup-review`** — Opens the gallery server from Claude Code
- **`/mockup-status`** — Shows current review status inline

## Data Storage

All data lives in `.mockup-gallery/` inside the project root:

```
.mockup-gallery/
  selections.json       Ratings + notes
  selected.json         Selected build (pages, components, saved)
  implemented.json      Implementation tracking
  accepted-designs.json Approved design patterns
```

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
