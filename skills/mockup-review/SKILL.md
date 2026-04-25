---
name: mockup-review
description: Use when the user wants to review HTML mockups, inspect mockup-gallery state, align selected mockups to routes or screens, or coordinate mockup implementation work from Codex without relying on Claude-specific hooks or slash commands.
---

# Mockup Review

Use this skill when the user wants to review or plan work from the mockups tracked by mockup-gallery.

## Sources of truth

- `registry.json` for route and screen mappings
- `.mockup-gallery/` JSON state for selections, ratings, saved items, and archive state
- `gallery/gallery.html` and `server/gallery-server.mjs` for the local review surface
- `commands/*.md` remain Claude-oriented companion assets; in Codex, prefer this skill directly

## Scratch-first rule

Every new review batch should begin with a low-fidelity black-and-white scratch mockup. Use it to test big layout, hierarchy, flow, and content changes quickly with fewer tokens before producing higher-fidelity variants. Name it with a prefix such as `00-scratch-`, `01-scratch-`, `lo-fi-`, or `wireframe-` so the gallery sorts it first.

## Workflow

1. Read `registry.json` and the relevant `.mockup-gallery/*.json` state files.
2. Summarize selected, active, saved, and archived mockups.
3. If the user needs the live gallery, launch it from the package root with `node server/gallery-server.mjs`.
4. Use the gallery state to recommend next implementation targets or missing route-to-mockup mappings.
5. Keep Codex usage additive only. Do not alter Claude hook behavior or slash-command semantics.
