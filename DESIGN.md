# Mockup Gallery Plugin — Design Notes

## Mockup Lifecycle States

### 1. Active
Mockups that are part of current design work.

**Detection:** `mockup.mtime >= project_last_change` OR mockup has no rating in `selections.json`

`project_last_change` = most recent of:
- Latest git commit timestamp (`git log -1 --format=%ct`)
- Most recent file modification in `src/`, `app/`, `components/` (if no git)

A 6-month-old repo with a mockup added yesterday → that mockup is Active.

### 2. Archived
Old mockups moved out of the main review flow.

**Detection:** Lives in `mockups/archive/` (or `docs/mockups/archive/`) subdirectory.

**Action:** Gallery provides "Archive" button that moves the file to the `archive/` subfolder in the repo. Git tracks the move.

Server scans both main dir and `archive/` — archived mockups shown in collapsed "Archive" section.

### 3. Implemented
Mockups (or components within them) that have been built and deployed in the actual codebase.

**Detection:** Listed in `.mockup-gallery/implemented.json`

**Format:**
```json
{
  "04-search-page.html": {
    "status": "implemented",
    "date": "2026-03-24",
    "components": {
      "Date Preset Buttons": {
        "file": "components/v3/V3FilterBar.tsx",
        "status": "implemented"
      },
      "Pulsing Search Input": {
        "file": "components/v3/V3SearchInput.tsx",
        "status": "implemented"
      },
      "AI Search Results (rich)": {
        "file": null,
        "status": "designed"
      }
    },
    "notes": "Partially implemented — search input and date presets done, AI response section pending"
  }
}
```

Component-level statuses:
- `designed` — in mockup only, not yet built
- `implemented` — built and in codebase (with file path)
- `modified` — implemented but changed from original mockup design
- `deprecated` — was implemented, now removed or replaced

**Action:** Gallery shows "Mark Implemented" button per component. Claude Code can also mark via `/mockup-selections` command.

### Gallery Sidebar Structure

```
ACTIVE (N)                    ← unrated or recently modified
  mockup-a.html
  mockup-b.html

IMPLEMENTED (N)               ← collapsed, green accent
  search-page.html  [3/5 components]
  ai-trends.html    [5/5 components]

ARCHIVE (N)                   ← collapsed, muted
  old-mockup.html
  rejected-v1.html
```

### Server Endpoints (additions needed)

- `POST /archive/<filename>` — moves file to `archive/` subfolder
- `POST /implement` — updates `implemented.json`
- `GET /implemented` — returns implemented status
- `GET /project-info` — returns last commit timestamp, project name

### Sorting Within Active

1. Unrated first (needs attention)
2. Then by modification time, newest first
3. Rated but not accepted last

### Data Files in .mockup-gallery/

```
.mockup-gallery/
├── selections.json        # Ratings + notes (auto-saved by gallery)
├── accepted-designs.json  # Approved design patterns manifest
├── implemented.json       # Implementation tracking (mockup → code mapping)
└── config.json            # Optional: custom paths, port, preferences
```
