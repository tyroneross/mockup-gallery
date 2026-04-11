---
name: mockup-session-new
description: Create a new mockup review session and make it current
user_invocable: true
---

Create a new review session on the running gallery server.

1. Prompt the user for:
   - **Name** (required) — human-readable title, e.g. "Coach screens review"
   - **Goal** (optional) — one-sentence description of what this session decides
   - **Tags** (optional) — comma-separated list, e.g. "ui, onboarding"
2. Call `POST /session/create` with JSON body `{ name, goal, tags }`. Omit `slug` — the server derives it from the name. (If the user explicitly wants a custom slug, include it.)
3. The response returns `{ slug, session }`.
4. Confirm to the user:
   - "Created session **<name>** (slug: `<slug>`)"
   - "This is now the current session. New mockups dropped into `mockups/sessions/<slug>/` will be scoped here."
5. If the gallery server isn't running, report: "Gallery server not running. Start it with `/mockup-review` first."

If the project is on the legacy flat layout, the server will prompt for migration before creating. Pass through any migration messages verbatim so the user can confirm.
