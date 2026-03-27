---
name: mockup-selections
description: Read all mockup selections and design decisions — use before implementing UI changes
---

Follow these steps:

1. Read both of these files from the project root:
   - `.mockup-gallery/selections.json`
   - `.mockup-gallery/accepted-designs.json` (if it exists)

2. Display the full structured output in this order:

   **Accepted designs** — for each approved item, show the filename, rating, and any component-level decisions recorded in the selections data.

   **Approved design patterns** — list all entries from `accepted-designs.json` under an approved patterns heading.

   **Rejected patterns** — list all entries marked as rejected, with the reason if one was recorded.

   **Still needs review** — list items that are unrated or marked "changes needed", including any feedback notes the user left.

3. This output gives you full context on what the user has approved before you make any UI changes. Do not implement UI changes that conflict with accepted designs or rejected patterns.
