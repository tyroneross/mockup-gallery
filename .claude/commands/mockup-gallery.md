---
name: mockup-gallery
description: Single entry point for mockup-gallery. Use this command to launch review, inspect state, manage sessions, prepare implementation handoff, or decide which mockup-gallery capability to use.
argument-hint: "[goal: launch | status | feedback | sessions | implement | handoff | help]"
---

# /mockup-gallery

Use this as the single Claude Code entry point for mockup-gallery. It is both a user command and an agent guide: when the plugin is installed and the user asks about mockups, design review, selected UI, implementation handoff, or gallery feedback, use this workflow.

**Raw user input:** $ARGUMENTS

## First Decision

1. If `$ARGUMENTS` is empty, show the **Capability Guide** below and ask what the user wants to do.
2. If the user wants the browser review UI, follow **Launch Gallery**.
3. If the user asks for status, feedback, selections, selected mockups, pending design work, or implementation context, follow **Read Project State**.
4. If the user wants to implement selected UI, follow **Implementation Handoff** before coding.
5. If the user asks for sessions, follow **Session Management**.
6. If intent is unclear, summarize the closest two options and ask one clarifying question.

## Capability Guide

- **Launch review** — start the local gallery for HTML mockups so the user can rate, select, save, archive, and share feedback.
- **Read feedback** — inspect current ratings, notes, selected mockups, picks, accepted designs, implementation status, and pending shared feedback.
- **Manage sessions** — list, create, switch, or archive named review sessions.
- **Prepare implementation** — convert selected mockups into an implementation handoff: selected source files, change notes, dynamic/static element map, data dependencies, actions, connectors, and unresolved questions.
- **Implement selected UI** — only after reading selected state and handoff context.
- **Sync docs** — verify COMMON.md, CLAUDE.md, and AGENTS.md alignment.

## Launch Gallery

Find a mockup directory in this order:

1. `mockups/`
2. `docs/mockups/`
3. `.claude/mockups/`

If none exists, tell the user to create HTML mockups in `mockups/`.

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/server/gallery-server.mjs" --project "$(pwd)" --dir "<found-dir>"
```

The server auto-opens the browser. Tell the user to rate, select, and share from the gallery. Mention that the first mockup in a new review batch should be a low-fidelity black-and-white scratch mockup named like `00-scratch-*.html`, `01-scratch-*.html`, `lo-fi-*.html`, or `wireframe-*.html`.

## Read Project State

Read state in this order:

1. `.mockup-gallery/pending-review.json` if it exists. This is a one-shot Share payload from the gallery.
2. `.mockup-gallery/state.json` to find `currentSession`.
3. If `currentSession` exists:
   - `.mockup-gallery/sessions/<currentSession>/selections.json`
   - `.mockup-gallery/sessions/<currentSession>/selected.json`
4. Otherwise:
   - `.mockup-gallery/selections.json`
   - `.mockup-gallery/selected.json`
5. Also read if present:
   - `.mockup-gallery/implemented.json`
   - `.mockup-gallery/accepted-designs.json`
   - `.mockup-gallery/last-change.json`

Summarize reviewed counts, selected pages and candidates, unassigned picks, saved items, pending `changeNote` items, implemented/done items, and actionable user notes.

## Implementation Handoff

Use this before implementing selected UI. Do not treat a visual mockup alone as enough context for integration-quality implementation.

1. Read selected state using **Read Project State**.
2. For every selected candidate that is not `status: "done"`, read the source mockup HTML from the active mockup directory or the current session directory.
3. Extract every UI element that may need implementation:
   - `data-component` sections
   - headings, labels, values, lists, tables, cards, charts, images, nav, buttons, links, forms, inputs, menus, toggles, dialogs
   - loading, empty, success, and error states when visible or implied
4. Classify each element:
   - `static` — literal copy, label, decoration, or fixed layout
   - `dynamic` — value, list, status, count, date, user data, remote data
   - `computed` — derived total, average, percentage, trend, formatted value
   - `userInput` — field/control users edit
   - `action` — click/submit/navigation/mutation/export/share/open modal
   - `unknown` — cannot infer; must be asked before implementation unless explicitly placeholder
5. For dynamic/computed/input/action elements, capture source, field path, schemas when known, loading/empty/error/success behavior, connector/API contract, and visualization encoding for charts.
6. Produce an implementation handoff summary with ready-to-build items, unresolved questions, assumptions, source mockups, and files likely to change after codebase inspection.

If the handoff reveals unknown data sources or side effects, ask concise questions before coding.

## Session Management

Use the running gallery server when possible:

- list sessions: `GET /sessions`
- create session: `POST /session/create`
- switch session: `POST /session/switch`
- archive session: `POST /session/<slug>/status`

If the server is not running, read `.mockup-gallery/state.json` and `mockups/sessions/*/session.json` directly for a read-only summary.

## Memories

If the user asks about design memories:

1. Read global memories from `${CLAUDE_PLUGIN_ROOT}/memories/global/*.md`.
2. Read project memories from `${CLAUDE_PLUGIN_ROOT}/memories/projects/<project-name>/*.md` if present.
3. Skip starter-template-only memory files.
4. Summarize durable preferences separately from current-session feedback.

If the user asks to promote a learning, ask whether it should be global or project-specific, then write it to the appropriate memory file.

## Sync Check

If the user asks to sync, validate, or check plugin docs:

```bash
node "${CLAUDE_PLUGIN_ROOT}/sync/check-alignment.mjs"
```

If gaps are found, show the exact gaps and propose patches. If no gaps are found, report "All docs aligned."

## Guardrails

- Always read `selections.json` and `selected.json` before implementing UI from mockups.
- Never implement rejected mockups.
- Never re-implement `status: "done"` selections unless the user explicitly asks.
- If a selected item has `changeNote`, implement only that described change.
- For new review batches, create the scratch mockup before high-fidelity variants.
- Keep implementation handoff concise: only include data that helps a human or LLM build correctly.
