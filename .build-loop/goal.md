# Goal — Mockup Review Sessions

Status: **PROPOSED** — awaiting approval before Phase 4 execution
Created: 2026-04-11
Owner: Tyrone Ross

## Problem

The mockup-gallery plugin treats the project's `mockups/` directory as a flat
list of files with a single shared state file at `.mockup-gallery/selections.json`.
This works at small scale but collapses when a project accumulates multiple
distinct review sessions over time:

- **State collision** — Two reviews cannot coexist without manual merge. We
  just hit this: SpeakSavvy-iOS had an icon-options review from 2026-04-08,
  and a coach-screens review from 2026-04-09 that landed in the wrong repo
  partly because there is no concept of "which review am I in."
- **No recall** — At 100+ mockups across many reviews, users cannot ask
  "show me the onboarding-flow review from March" or "what did we decide for
  app icons." Everything lives in one flat bucket.
- **No staleness** — Reviews never get marked abandoned or superseded. Old
  mockups sit in `archive/` indistinguishable from retained references.
- **No iteration tracking** — When "icon-review-v2" replaces "icon-review-v1",
  there is no link between them. History is lost.

## Desired Outcome

The mockup-gallery plugin supports **review sessions as a first-class
primitive**. Each review is a folder under `mockups/sessions/` with its own
metadata, mockups, and state. The gallery UI defaults to the active session,
offers a session switcher, supports filtering by status/tag, and migrates
existing flat layouts on first run.

Users can scale to hundreds of mockups without losing context.

## Non-Goals

- **Not a CMS.** Sessions are a folder convention + JSON metadata, not a
  database. File-level operations stay the source of truth.
- **Not multi-user.** Single-author model. No collaborative state, no locks,
  no conflict resolution beyond last-write-wins per session.
- **Not a project switcher.** Sessions belong to one project; project switching
  is still "launch gallery from a different cwd."
- **No breaking changes to the CLI for existing users.** Current flat layout
  continues to work; sessions are opt-in via migration.

## Scoring Criteria

Five code-based graders. No LLM judges (the feature is structural, not
aesthetic).

| # | Criterion | Grader | Pass condition |
|---|---|---|---|
| 1 | Schema correctness | `node --check` + JSON schema validation | session.json validates against schema; selections.json per-session validates |
| 2 | Migration preserves data | Integration test with fixture project | Flat `mockups/` + existing `.mockup-gallery/selections.json` migrate to `sessions/legacy/` + per-session state with zero rating loss (byte-compare selections arrays) |
| 3 | Gallery serves sessions | HTTP test against running server | `GET /sessions` returns list; `GET /session/<slug>` returns metadata; `GET /mockups?session=<slug>` returns filtered list; `POST /session/switch` updates current pointer |
| 4 | UI session switcher works | Puppeteer/IBR flow | Load gallery → switcher dropdown shows all sessions → clicking a session updates URL + list + ratings without page reload |
| 5 | Backward compat with flat layout | Integration test | Project with flat `mockups/` (no sessions dir) still boots the gallery, prompts one-time migration, gallery remains usable pre-migration |

Each criterion produces: command/test name → pass/fail → log file path as
evidence. Writes to `.build-loop/evals/2026-04-xx-sessions-scorecard.md`.

## Evaluation plan

**Fixture-driven.** Create three fixture projects under `test/fixtures/`:
1. `flat-unmigrated/` — old-shape project, no sessions dir
2. `flat-migrated/` — post-migration project
3. `multi-session/` — several sessions with distinct states

Run grader commands against each fixture. No manual clicking for graders 1-3
and 5. Grader 4 needs a headless browser — use IBR's scan capability or fall
back to a Playwright smoke script if IBR can't drive a local `http://` URL.

## Open questions (for the user)

- **Q1.** When a user launches the gallery on a project with existing flat
  layout, should migration be automatic (silent) or prompted? Recommendation:
  prompt once, preserve old layout untouched until user confirms.
- **Q2.** Should `session.json` live inside each session folder (distributed)
  or be centralized in `.mockup-gallery/sessions.json` (one index file)?
  Recommendation: **distributed** — each session folder is self-contained and
  portable across projects.
- **Q3.** Should the `current` pointer be a symlink or a JSON field in
  `.mockup-gallery/state.json`? Symlinks are clearer in `ls` output but fragile
  on Windows. Recommendation: **JSON field** for portability, with a fallback
  read of a symlink if present.
- **Q4.** Session slug format — user-chosen (`coach-screens`) or auto-generated
  (`2026-04-09-coach-screens`)? Recommendation: auto-generate with date prefix
  so chronological ordering is free, allow user to override.
