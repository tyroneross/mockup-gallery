---
name: mockup-review
description: Use to create HTML mockups for review, check design selections/ratings, or implement approved designs. Triggers on "mockup", "design review", "gallery", "rate mockup", "accepted designs".
---

## 1. Creating mockups for review

Each mockup is a single self-contained HTML file:

- Start each new review batch with a low-fidelity black-and-white scratch mockup. Use it to resolve big layout, hierarchy, flow, and content decisions quickly with fewer tokens before making higher-fidelity alternatives.
- Name the scratch mockup so the gallery can sort it first, for example `00-scratch-dashboard.html`, `01-scratch-home.html`, `lo-fi-profile.html`, or `wireframe-checkout.html`.
- Keep scratch mockups plain: monochrome, rough structure, direct labels, and no decorative polish unless it answers the structural decision.
- Load Tailwind via CDN (`<script src="https://cdn.tailwindcss.com"></script>`) — no build step.
- For higher-fidelity mockups, use Aurora Deep styling: dark backgrounds (`bg-gray-950`, `bg-gray-900`), violet/indigo accents (`violet-500`, `indigo-400`), subtle glow effects via `shadow` and `ring` utilities.
- No external asset dependencies. Inline all icons as SVG. Use placeholder colors instead of images.
- Label every distinct component with a `data-component="ComponentName"` attribute so the gallery can identify sections for component-level review.
- Add a visible section label in small muted text above each component block so users know what they are rating.
- Keep each mockup focused: one screen or one component cluster per file.

Example component block:
```html
<section data-component="TopNav" class="...">
  <p class="text-xs text-gray-500 mb-2">Component: TopNav</p>
  <!-- nav content -->
</section>
```

## 2. Component-level review

Define named sections with `data-component` attributes so the gallery server can surface them as individual rateable units. Use clear, stable names (PascalCase) that match the component names used in the actual codebase when one exists.

If a mockup contains multiple variants of the same component, suffix them: `CardVariantA`, `CardVariantB`.

## 3. Reading feedback from selections.json

After a review session, read `.mockup-gallery/selections.json`. The structure is:

```json
{
  "mockup-filename.html": {
    "rating": "approved | maybe | changes | rejected | unrated",
    "notes": "user's freeform note",
    "components": {
      "ComponentName": {
        "rating": "approved | changes | rejected",
        "notes": "component-specific note"
      }
    }
  }
}
```

Use ratings and notes to drive the next iteration:
- `approved` — ship as-is or port to production code.
- `maybe` — user is undecided; ask a clarifying question before iterating.
- `changes` — read the notes and revise the mockup. Create a new file (`v2`) rather than overwriting.
- `rejected` — do not reuse this pattern. Record it in `accepted-designs.json` under `rejectedPatterns`.

## 4. Accepted designs workflow

After a review session where items reach `approved` status, consolidate decisions into `.mockup-gallery/accepted-designs.json`:

```json
{
  "approvedPatterns": [
    {
      "name": "PatternName",
      "source": "mockup-filename.html",
      "component": "ComponentName",
      "description": "What was approved and why",
      "tailwindClasses": ["bg-gray-900", "..."] // key classes if relevant
    }
  ],
  "rejectedPatterns": [
    {
      "name": "PatternName",
      "reason": "Why it was rejected"
    }
  ]
}
```

Write this file yourself after summarizing the session — do not ask the user to write it.

## 5. Integration with Calm Precision

When building mockups, apply these structural rules from the Calm Precision skill:

- Single border around related groups; dividers between items. Never individual borders on list items.
- Title 14–16px bold → Description 12–14px → Metadata 11–12px muted.
- Status conveyed by text color only — no background badges.
- Content-to-chrome ratio ≥ 70%.
- Selected nav items: `text-gray-900 font-medium` + 2px bottom border. Never background pills.
- Buttons: full-width for conversions, compact for quick actions. Action buttons must have distinct enabled/disabled states.

If the Calm Precision skill is available in the project, load it before building any mockup.

## 6. Iteration loop

1. **Create** — build a self-contained HTML mockup with labeled components.
2. **Launch** — run `/mockup-gallery launch` to open the gallery server.
3. **User rates** — user assigns ratings and notes per mockup and per component.
4. **Read feedback** — run `/mockup-gallery feedback` or `/mockup-gallery handoff` to load full context.
5. **Revise** — create `v2` (or `v3`) mockup files addressing `changes` feedback. Do not delete prior versions.
6. **Consolidate** — when items reach `approved`, write decisions to `accepted-designs.json`.
7. **Implement** — port approved designs to production components, referencing `accepted-designs.json` to ensure fidelity.

Never implement production UI changes before reading `/mockup-gallery handoff` or the equivalent selected-state files. Never override an `approved` pattern without explicit user instruction.
