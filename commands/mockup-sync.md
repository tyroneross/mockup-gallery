---
name: mockup-gallery:sync
description: Check alignment between COMMON.md, CLAUDE.md, and AGENTS.md
user_invocable: true
---

Run the sync check:

```bash
node "${CLAUDE_PLUGIN_ROOT}/sync/check-alignment.mjs"
```

If gaps are found:
1. Show the output to the user
2. For each gap, read the relevant section of COMMON.md and the platform doc
3. Suggest a specific patch (the actual text to add or change) for each platform doc
4. Ask the user which patches to apply

If no gaps found, report "All docs aligned."
