---
name: mockup-feedback
description: Pull latest ratings, comments, and selections from the mockup gallery
user_invocable: true
---

Check if the mockup gallery has pending feedback for this project.

1. Read `.mockup-gallery/selections.json` in the current working directory
2. Read `.mockup-gallery/selected.json` in the current working directory
3. If neither exists, report "No mockup gallery data found for this project."

Otherwise, summarize:
- **Ratings**: List each mockup with its rating (yay/nay/unrated)
- **Comments**: Any notes or component-level feedback (look for component names >30 chars with actionable words like "should", "need", "change", "fix", "remove", "add")
- **Selections**: Which mockups are assigned to which routes
- **Pending**: Any unrated mockups that need review

Format as a concise status report. If there are actionable comments, highlight them as "Action needed" items.
