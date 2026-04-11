---
name: mockup-session-list
description: List all review sessions in the current project's mockup gallery
user_invocable: true
---

Sessions group mockup reviews into distinct batches (e.g. "app icons review" vs "coach screens review") instead of one flat directory. Use this command to see every session for the current project.

1. Hit `GET /sessions` on the running gallery server. The port is resolved from a hash of the project root — if the user already ran `/mockup-review`, the server is up. Otherwise, tell them to start it with `/mockup-review` and rerun this command.
2. The response returns `{ sessions: [...], currentSession: "<slug>", layout: "sessions" | "flat" }`.

If `layout` is `"flat"`:
- Tell the user: "This project is on the legacy flat layout. Sessions are opt-in — run `/mockup-session-new` to create the first session and migrate existing mockups (non-destructive)."
- Stop here.

If `layout` is `"sessions"`, format the output grouped by status. For each session, show one row with name, slug, created date, and tags. Mark the `currentSession` with an arrow or `(current)` label.

```
## Active
  -> coach-screens-review    coach-screens-review    2026-04-08    [ui, onboarding]
     icon-candidates         icon-candidates         2026-04-06    [branding]

## Decided
     color-palette-v2        color-palette-v2        2026-03-30    [tokens]

## Stale
     (none)

## Superseded
     hero-layout-v1          hero-layout-v1          2026-03-22    [landing]  -> hero-layout-v2
```

If no sessions exist yet, say: "No sessions yet. Run `/mockup-session-new` to create one."

If the gallery server isn't running, report: "Gallery server not running. Start it with `/mockup-review` then rerun `/mockup-session-list`."
