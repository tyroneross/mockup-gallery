# Selected Build — Design

## Concept

The "Selected" build is a curated collection of approved pages and components that becomes the implementation target. Users build it incrementally:

1. Browse mockups in the gallery
2. "Select This Page" → entire page becomes the Selected version for that route
3. "Add Component" → individual component from any mockup gets added to the Selected build
4. The Selected build is the source of truth for implementation

## Data Model

`.mockup-gallery/selected.json`:

```json
{
  "updated": "2026-03-27",
  "pages": {
    "/search": {
      "source": "04-search-page.html",
      "selectedAt": "2026-03-27",
      "note": "Full page selected"
    },
    "/aitrends": {
      "source": "06-ai-trends.html",
      "selectedAt": "2026-03-27",
      "note": null
    }
  },
  "components": {
    "Pulsing Search Input": {
      "source": "v-creative-a.html",
      "page": "/search",
      "selectedAt": "2026-03-27",
      "note": "Apply to all search inputs"
    },
    "Connected Entities Panel": {
      "source": "v-creative-b.html",
      "page": "/newsfeed",
      "selectedAt": "2026-03-27",
      "note": "Slide-in from right"
    },
    "Trending Edge Shimmer": {
      "source": "v-creative-a.html",
      "page": "global",
      "selectedAt": "2026-03-27",
      "note": "Apply to all trending article cards"
    }
  }
}
```

## Gallery UI

### "Select" button in review bar
Next to Approve/Maybe/Changes/Reject, add a "Select" action:
- "Select Page" — marks entire mockup as the Selected version for a route
- Prompts: "Which page route? /search, /newsfeed, /aitrends, /graph, /settings"

### "Add to Selected" per component
In the component ratings panel, each component gets an "Add" button:
- Prompts: "Which page should this component appear on?"
- Options: existing page routes or "global" (appears everywhere)

### "Selected" sidebar section
New section at top of sidebar (above Active):
- Shows the current Selected build
- Grouped by page route
- Each entry: page route + source mockup + component overrides
- Click to preview that mockup

### Claude Code reads selected.json
`/mockup-selections` command shows the Selected build as the primary output.
SessionStart hook mentions: "Selected build: 3 pages, 5 components defined."
