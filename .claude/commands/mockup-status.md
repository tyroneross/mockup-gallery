---
name: mockup-status
description: Show mockup review progress — lifecycle states, ratings, implementation tracking
---

Follow these steps:

1. Read `.mockup-gallery/selections.json` from the project root (the current working directory).

2. If the file does not exist, tell the user: "No mockup reviews found. Run /mockup-review to start." Stop here.

3. Read `.mockup-gallery/implemented.json` if it exists.

4. Summarize in this structure:

   **Lifecycle Overview:**
   - Active: N mockups (M unrated, K rated)
   - Implemented: N mockups (list each with component progress like "search-page [3/5]")
   - Archived: N mockups

   **Needs Attention** (unrated + "changes needed") — list each with filename and user notes.

   **Implementation Progress** — for each item in implemented.json:
   - Mockup name + overall status (designed/partial/implemented)
   - Per-component: name + status + code file path (if set)

   **Rating Breakdown:**
   - Approved: N
   - Maybe: N
   - Changes: N
   - Rejected: N
   - Unrated: N

5. Also check `.mockup-gallery/accepted-designs.json`. If it exists, list approved and rejected design patterns.
