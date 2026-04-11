---
name: mockup-gallery:sync
description: Check alignment between COMMON.md, CLAUDE.md, and AGENTS.md
user_invocable: true
---

Run the sync check:

```bash
node "${CLAUDE_PLUGIN_ROOT}/sync/check-alignment.mjs"
```

The alignment check scope covers `COMMON.md`, `CLAUDE.md` (top-level plugin doc), `AGENTS.md`, and the session schema files under `src/schemas/*.json`. In addition to standard drift detection, verify that every session route referenced by a slash command (any `POST` or `GET` path starting with `/session` or `/sessions`) actually exists in `server/gallery-server.mjs`. Flag any command that references a route the server doesn't implement.

If gaps are found:
1. Show the output to the user
2. For each gap, read the relevant section of COMMON.md and the platform doc
3. Suggest a specific patch (the actual text to add or change) for each platform doc
4. Ask the user which patches to apply

If no gaps found, report "All docs aligned."
