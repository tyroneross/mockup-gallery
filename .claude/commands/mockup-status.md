---
name: mockup-status
description: Show mockup review progress — ratings, notes, and pending items
---

Follow these steps:

1. Read `.mockup-gallery/selections.json` from the project root (the current working directory).

2. If the file does not exist, tell the user: "No mockup reviews found. Run /mockup-review to start." Stop here.

3. Parse the selections and summarize in this structure:

   **Rating counts:**
   - Approved: N
   - Maybe: N
   - Changes needed: N
   - Rejected: N
   - Unrated: N

   **Needs attention** (changes needed + unrated) — list each item with its filename and any notes the user left.

   **Accepted** — brief list of approved item filenames.

4. Also check `.mockup-gallery/accepted-designs.json` in the project root. If it exists, read it and list the approved design patterns under a section called **Accepted design patterns**.
