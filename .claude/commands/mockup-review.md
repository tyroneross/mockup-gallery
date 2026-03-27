---
name: mockup-review
description: Launch the mockup review gallery to rate and annotate design mockups
---

Follow these steps:

1. Find the project's mockup directory. Check these locations in order within the current working directory:
   - `mockups/`
   - `docs/mockups/`
   - `.claude/mockups/`

2. If no mockup directory is found, tell the user: "No mockup directory found. Create HTML mockups in a `mockups/` directory and run this command again." Stop here.

3. Launch the gallery server:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/server/gallery-server.mjs" --project "$(pwd)" --dir "<found-dir>"
   ```
   Replace `<found-dir>` with the path you found in step 1.

4. The server will auto-open the browser automatically.

5. Tell the user: "Gallery running at http://localhost:PORT. Rate mockups and add notes — selections auto-save to .mockup-gallery/selections.json. Use /mockup-status to check progress."
