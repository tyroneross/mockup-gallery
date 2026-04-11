---
name: mockup-feedback
description: Pull latest ratings, comments, and selections from the mockup gallery
user_invocable: true
---

Check if the mockup gallery has pending feedback for this project.

> **Note:** Feedback is scoped to the current session by default — this command reads `.mockup-gallery/sessions/<currentSession>/selections.json`. To review feedback from a different session, switch first: run `/mockup-session-list` to see all sessions, then switch the gallery server's current session to the target before rerunning this command.

1. Read `.mockup-gallery/selections.json` in the current working directory
2. Read `.mockup-gallery/selected.json` in the current working directory
3. If neither exists, report "No mockup gallery data found for this project."

Otherwise, summarize:
- **Ratings**: List each mockup with its rating (yay/nay/unrated)
- **Comments**: Any notes or component-level feedback (look for component names >30 chars with actionable words like "should", "need", "change", "fix", "remove", "add")
- **Selections**: Which mockups are assigned to which routes
- **Pending**: Any unrated mockups that need review

Format as a concise status report. If there are actionable comments, highlight them as "Action needed" items.
