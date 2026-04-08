# mockup-gallery

Guidance for AI coding agents (Codex, Cursor, Copilot, Gemini CLI) working with projects that use mockup-gallery for design review.

See [COMMON.md](COMMON.md) for data formats, behavioral rules, and mockup conventions shared across all platforms.

## What This Is

mockup-gallery is a design review system for HTML mockups. Users rate mockups in a browser-based gallery, and agents read the review data to implement approved designs.

## Finding Review Data

Look for `.mockup-gallery/` in the project root. If it exists, this project has active design review data.

```
.mockup-gallery/
  selections.json       — Ratings and notes per mockup
  selected.json         — Curated build: which mockups map to which pages
  implemented.json      — Implementation tracking per component
  accepted-designs.json — Approved/rejected design patterns
```

All file formats are documented in COMMON.md.

## Finding Mockups

HTML mockup files live in the project (not in `.mockup-gallery/`). Check these directories:
1. `mockups/`
2. `docs/mockups/`
3. `.claude/mockups/`

## Before Implementing UI Changes

1. Read `.mockup-gallery/selections.json` — check what's been rated and what feedback exists.
2. Read `.mockup-gallery/selected.json` — check which mockups are assigned to which pages.
3. If a page has `status: "pending"` and a `changeNote`, implement only the described changes.
4. If a page has `status: "done"`, do not re-implement unless explicitly asked.
5. Read the actual mockup HTML file (`mockups/<source>`) to understand the target design.

## Creating Mockups

Follow the format in COMMON.md:
- Self-contained HTML with Tailwind CDN
- `data-component` attributes on every distinct section
- Visible component labels
- One screen per file

## Global Memories

If the mockup-gallery plugin is installed, global design memories are at:
- `<plugin-root>/memories/global/design-preferences.md`
- `<plugin-root>/memories/global/implementation-lessons.md`
- `<plugin-root>/memories/projects/<project-name>/design-preferences.md`

These are optional context. If you can access them, read before making design decisions. If not, proceed with project-local data only.

## No Plugin Required

This file and `.mockup-gallery/` data are all you need. The Claude Code plugin adds hooks and commands for convenience, but the data format is the shared interface. Read the files, follow the rules in COMMON.md.
