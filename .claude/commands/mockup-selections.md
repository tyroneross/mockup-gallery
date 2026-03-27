---
name: mockup-selections
description: Read all mockup selections, design decisions, and implementation status — use before implementing UI changes
---

Follow these steps:

1. Read ALL of these files from the project root (skip any that don't exist):
   - `.mockup-gallery/selections.json` — live ratings and notes
   - `.mockup-gallery/accepted-designs.json` — approved design patterns
   - `.mockup-gallery/implemented.json` — implementation tracking (mockup → code file mapping)
   - `.mockup-gallery/last-change.json` — when the last gallery change was made

2. Display the full structured output in this order:

   **Last updated** — show the timestamp from `last-change.json` so you know how fresh the data is.

   **Implementation Status** — for each entry in `implemented.json`:
   - Mockup name + overall status (designed/partial/implemented)
   - Per-component: name + status + code file path
   - This tells you what's already been built

   **Accepted designs** — for each item rated "yay", show the filename and component-level decisions.

   **Approved design patterns** — list from `accepted-designs.json`.

   **Rejected patterns** — list with reasons.

   **Needs review** — items that are unrated or "changes needed", with user feedback notes.

3. This output gives you full context on what the user has approved and what's already built. Do not:
   - Implement UI that conflicts with accepted designs
   - Rebuild components already marked as implemented
   - Use rejected patterns
   - Ignore user feedback notes on "changes needed" items
