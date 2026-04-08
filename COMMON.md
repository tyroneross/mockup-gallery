# mockup-gallery — Common Instructions

Shared rules for all agents working with mockup-gallery data. Platform-specific guidance lives in CLAUDE.md (Claude Code) and AGENTS.md (Codex, Cursor, Copilot).

## Data Location

Review data lives in `.mockup-gallery/` inside each project root. Mockup HTML files live in the project's `mockups/` directory (or `docs/mockups/`, `.claude/mockups/`).

## Data Schema

### selections.json — Ratings and Notes

```json
{
  "selections": [
    {
      "file": "mockup-filename.html",
      "name": "Display Name",
      "rating": "yay | nay | unrated",
      "note": "Freeform feedback text or null",
      "components": [
        {
          "name": "ComponentName",
          "rating": "yay | nay | unrated",
          "note": "Component-specific feedback or null"
        }
      ]
    }
  ]
}
```

### selected.json — Curated Build

```json
{
  "updated": "YYYY-MM-DD",
  "pages": {
    "/route": {
      "source": "mockup-filename.html",
      "selectedAt": "YYYY-MM-DD",
      "status": "pending | done",
      "changeNote": "Description of what to change or null",
      "note": "General note or null"
    }
  },
  "components": {
    "ComponentName": {
      "source": "mockup-filename.html",
      "page": "/route | global",
      "selectedAt": "YYYY-MM-DD",
      "note": "Usage note or null"
    }
  },
  "saved": ["mockup-filename.html"]
}
```

### implemented.json — Implementation Tracking

```json
{
  "mockup-filename.html": {
    "status": "designed | partial | implemented",
    "components": {
      "ComponentName": {
        "status": "designed | implemented",
        "codeFile": "path/to/component.tsx or null"
      }
    }
  }
}
```

### accepted-designs.json — Approved/Rejected Patterns

```json
{
  "design_patterns": {
    "approved": [
      {
        "name": "PatternName",
        "source": "mockup-filename.html",
        "component": "ComponentName",
        "description": "What was approved and why"
      }
    ],
    "rejected": [
      {
        "name": "PatternName",
        "reason": "Why it was rejected"
      }
    ]
  }
}
```

## Rating Semantics

- **yay** — Approved. Ship as-is or port to production code.
- **nay** — Rejected. Do not reuse this pattern. Record in `accepted-designs.json` under rejected.
- **unrated** — Needs review. Do not implement until rated.

## Mockup Format

- Self-contained HTML files. Load Tailwind via CDN (`<script src="https://cdn.tailwindcss.com"></script>`).
- No external asset dependencies. Inline all icons as SVG.
- Label components with `data-component="ComponentName"` attributes.
- Add visible section labels: `<p class="text-xs text-gray-500 mb-2">Component: Name</p>`.
- One screen or component cluster per file. PascalCase component names.
- Variants: suffix with A/B (`CardVariantA`, `CardVariantB`).

## Behavioral Rules

1. **Read before implementing.** Always read `selections.json` and `selected.json` before implementing UI changes.
2. **Respect ratings.** Never implement unrated mockups. Never reuse rejected patterns.
3. **Don't override approved patterns** without explicit user instruction.
4. **Version, don't overwrite.** Create `v2`, `v3` files when iterating — don't overwrite originals.
5. **Scope changes to descriptions.** If a `changeNote` exists on a selected page, only modify the aspects described. Don't restructure parts of the UI not mentioned.
6. **Compare before building.** Compare mockup HTML against current implementation to identify deltas.

## Memories

Global design memories live in the mockup-gallery plugin repo under `memories/`. Two tiers:

- `memories/global/` — Preferences and lessons that apply to all projects.
- `memories/projects/<project-name>/` — Overrides specific to one project.

Per-project memories take precedence over global when both exist. Memories are markdown files, readable by any agent.
