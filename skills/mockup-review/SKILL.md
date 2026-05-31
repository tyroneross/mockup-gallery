---
name: mockup-review
description: Use to create scratch-first HTML mockups, optionally use image generation for visual assets, launch/review mockups, check selections, align mockups to routes/screens, or implement approved designs from the mockup gallery.
---

# Mockup Review

Use this skill when the user wants Codex to create, review, select, revise, or implement mockups tracked by mockup-gallery.

## Sources of truth

- `COMMON.md` and `AGENTS.md` for shared mockup format and implementation rules
- `.mockup-gallery/` JSON state for selections, ratings, saved items, archive state, and workflow preferences
- `DESIGN.md` at the project root for the design-system (visual identity: colors, typography, spacing, elevation, shape) in [Google's DESIGN.md format](https://github.com/google-labs-code/design.md). When present, treat its YAML tokens as canonical and align new mockups to them. Scaffold a starter via `POST /design-system/scaffold` if absent.
- `mockups/`, `docs/mockups/`, or `.claude/mockups/` for HTML mockup files
- `gallery/gallery.html` and `server/gallery-server.mjs` for the local review surface
- `commands/*.md` remain Claude-oriented companion assets; in Codex, prefer this skill directly

## Wireframe-first toggle

The gallery exposes a `Lo-fi first` toggle in the sidebar that controls whether new review batches default to a low-fidelity wireframe step before any hi-fi HTML variants. The preference is persisted at `.mockup-gallery/state.json#preferences.wireframeFirst` and defaults to `true` on a fresh project. Read it before creating new mockups:

- If `wireframeFirst` is `true` (default), begin every new review batch with a low-fidelity black-and-white scratch mockup. Use it to decide big layout, hierarchy, flow, and content changes quickly with fewer tokens before producing higher-fidelity variants. Name it with a prefix such as `00-scratch-`, `01-scratch-`, `lo-fi-`, or `wireframe-` so the gallery sorts it first.
- If `wireframeFirst` is `false`, the user has opted out — proceed directly to hi-fi HTML mockups for new batches.
- An approved wireframe that already exists for the screen also satisfies the rule; you may move to hi-fi without a fresh scratch.

The toggle is a default, not a hard block — if the user explicitly asks to skip the scratch step on a specific batch, honor that request without flipping the global toggle.

Read the live preference value from the running gallery via `GET http://localhost:<port>/preferences`, or directly from `.mockup-gallery/state.json` when the server is not running. Treat a missing `preferences` block as `wireframeFirst: true`.

## Creating mockups in Codex

1. Inspect the target app enough to understand routes, components, data, and visual conventions.
2. Create a single self-contained HTML file in the first available mockup directory, preferring `mockups/`.
3. Load Tailwind through the CDN. Do not add a build step.
4. Add `data-component="ComponentName"` to each distinct section.
5. Add a visible muted component label above each rateable section.
6. Keep each file to one screen or one component cluster.
7. Version iterations with `v2`, `v3`, etc. Do not overwrite prior reviewed mockups.

Scratch mockups should be monochrome, rough, direct, and focused on layout, hierarchy, flow, and content decisions.

Higher-fidelity mockups should only follow once the structure is clear. Match the product's existing visual language when available; otherwise keep the design restrained and reviewable rather than decorative.

## Image generation assist

Use image generation only when a bitmap asset would materially improve review quality, such as product imagery, a realistic hero background, avatars, empty-state artwork, or visual references that cannot be represented well with simple HTML.

Rules:

- Do not use generated images for the first scratch mockup.
- Prefer HTML, CSS, Tailwind, and inline SVG for layout and UI controls.
- If generated assets are used, keep them local to the project, for example under `mockups/assets/` or the relevant session assets directory.
- Do not depend on remote or temporary image URLs in review mockups.
- If image generation is unavailable or cannot persist files locally, continue with placeholders and note the asset need in the mockup or handoff.

## Workflow

1. For new design work, create the scratch mockup first.
2. If the user needs the live gallery, launch it from the package root with `node server/gallery-server.mjs`.
3. For review/status work, read `.mockup-gallery/state.json` first if present, then session state or legacy flat state.
4. Summarize selected, active, saved, archived, and pending-change mockups.
5. For implementation, read selected state and source mockup HTML before coding.
6. Ask a concise question when the target route, data source, action behavior, or validation target is unclear.
7. Keep Codex usage additive only. Do not alter Claude hook behavior or slash-command semantics.

## Implementation guardrails

- Never implement unrated or rejected mockups.
- Never re-implement `status: "done"` selections unless the user explicitly asks.
- If a selected item has `changeNote`, implement only that described change.
- Compare the source mockup against the current implementation before editing production UI.
- Preserve approved patterns unless the user explicitly asks to change them.
