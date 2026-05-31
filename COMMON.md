# mockup-gallery — Common Instructions

Shared rules for all agents working with mockup-gallery data. Platform-specific guidance lives in CLAUDE.md (Claude Code) and AGENTS.md (Codex, Cursor, Copilot).

## Data Location

Review data lives in `.mockup-gallery/` inside each project root. Mockup HTML files live in the project's `mockups/` directory (or `docs/mockups/`, `.claude/mockups/`).

The project-root `DESIGN.md` (in [Google's design-system format](https://github.com/google-labs-code/design.md)) is the visual-identity source of truth — colors, typography, spacing, elevation, shape. It lives alongside `package.json`, not under `.mockup-gallery/`, and is shared by mockup-gallery, ad-hoc design tools, and AI coding agents.

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

#### Implementation Tracking Fields (via `POST /session/mark-implemented`)

Entries written by the mark-implemented endpoint include:

- `implemented` (boolean) — Whether the mockup has been built
- `implementedAt` (ISO string) — When it was marked as implemented
- `commitRef` (string, optional) — Git commit hash reference
- `status` (string) — Set to `"implemented"` for consistency with the component-level tracking

### Mockup Variant Fields (via `GET /mockups`)

When filenames contain dark/light variants (e.g., `dashboard-dark.html` and `dashboard-light.html`), the `/mockups` response annotates each mockup:

- `variant` (string) — `"dark"` or `"light"` when detected
- `pairedWith` (string) — Filename of the counterpart variant, or `undefined` if no pair

### state.json — Top-Level Pointer and Preferences

```json
{
  "version": 2,
  "currentSession": "<slug-or-null>",
  "migratedFrom": null,
  "migratedAt": null,
  "preferences": {
    "wireframeFirst": true
  }
}
```

- `version` — schema version (current: `2`)
- `currentSession` — slug of the active review session, or `null` in legacy flat mode
- `preferences.wireframeFirst` — when `true` (default), new review batches start with a low-fidelity wireframe before hi-fi HTML variants. The gallery exposes a `Lo-fi first` sidebar toggle that flips this. When `false`, the host coding agent may proceed directly to hi-fi mockups for new batches.

### handoff/ — Per-Route Implementation Handoff Artifacts

When the user selects a page via the gallery, the server writes one structured Markdown file per route to `.mockup-gallery/handoff/<route-slug>.md` (legacy/flat) or `.mockup-gallery/sessions/<slug>/handoff/<route-slug>.md` (sessions). Each file is the canonical implementation brief for that route:

```yaml
---
schema: mockup-gallery-handoff
schemaVersion: 1
route: "/search"
slug: search
source: "04-search-page.html"
session: "<slug-or-empty>"
selectedAt: "YYYY-MM-DD"
status: "pending"
primary: true
changeNote: "Tighten search input"
note: ""
filled: false
---
```

Body sections: Source, Components (with classification table), Data Elements, Connectors / APIs, Visualizations, States, Open Questions. The host coding agent fills the placeholders by reading the source mockup's `data-component` markup, classifying each element (`static | dynamic | computed | userInput | action | unknown`), capturing data sources and connector contracts, and listing open questions. Flip `filled: true` in the frontmatter when complete.

DESIGN.md and these handoff artifacts are deliberately distinct: DESIGN.md = visual identity; handoff = interactions / data / states / connectors per selected page. Re-emit is idempotent (existing handoff files are preserved); pass `regenerateHandoffs: true` on the `/selected` POST to overwrite.

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

- Start every new review batch with a low-fidelity scratch mockup. The first mockup should be a black-and-white sketch used to decide big layout, hierarchy, flow, and content changes quickly with fewer tokens before any higher-fidelity variants are created.
- Name scratch files so the gallery can prioritize them first, for example `00-scratch-dashboard.html`, `01-scratch-home.html`, `lo-fi-profile.html`, or `wireframe-checkout.html`.
- Keep scratch mockups intentionally plain: monochrome, rough spacing, direct labels, no gradients, no decorative assets, and no production polish unless needed to answer the structural question.
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
