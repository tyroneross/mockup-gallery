---
name: mockup-session-archive
description: Archive a review session as decided, stale, or superseded
user_invocable: true
---

Archive a session by updating its status. Accepts an optional slug argument.

1. Determine the target slug:
   - If the user passed a slug as an argument, use it.
   - Otherwise, run the logic from `/mockup-session-list` to show all sessions, then ask: "Which session do you want to archive? (slug)"
2. Ask the user which status to apply:
   - **decided** — review is complete, a choice was made
   - **stale** — no longer relevant, abandoned
   - **superseded** — replaced by a newer session
3. If the user picked **superseded**, also ask: "What is the slug of the session that replaces this one?"
4. Call the appropriate route:
   - For `decided` or `stale`: `POST /session/<slug>/status` with body `{ status: "decided" }` or `{ status: "stale" }`
   - For `superseded`: `POST /session/<slug>/supersede` with body `{ supersededBy: "<new-slug>" }`
5. Confirm to the user: "Archived session `<slug>` as **<status>**." For superseded, also mention the superseding slug.

If the gallery server isn't running, report: "Gallery server not running. Start it with `/mockup-review` first."
