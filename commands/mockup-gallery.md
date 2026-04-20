---
name: mockup-gallery
description: Main mockup-gallery entry. Dispatches to a subcommand based on your request, or lists options if unclear. Use `mockup-gallery:<subcommand>` to target a specific action directly.
argument-hint: "[what you want to do]"
---

# /mockup-gallery — Router

Route this request to the appropriate mockup-gallery subcommand or skill based on the user's intent.

**Raw user input**: $ARGUMENTS

## Routing logic

1. If `$ARGUMENTS` is empty or only whitespace: list the available subcommands below and ask the user what they want to do.
2. Otherwise: match the user's natural-language request against the subcommand intents below and invoke the best match.
3. If the request clearly doesn't fit any subcommand but matches a `mockup-gallery` skill (listed in your available skills), load the skill and follow its guidance instead.
4. If nothing fits, say so and list the subcommands. Do NOT guess.

## Available subcommands

- **`/mockup-gallery:mockup-feedback`** — Pull latest ratings, comments, and selections from the mockup gallery
- **`/mockup-gallery:mockup-memories`** — Show global and project-specific design memories, or promote learnings
- **`/mockup-gallery:mockup-session-archive`** — Archive a review session as decided, stale, or superseded
- **`/mockup-gallery:mockup-session-list`** — List all review sessions in the current project's mockup gallery
- **`/mockup-gallery:mockup-session-new`** — Create a new mockup review session and make it current
- **`/mockup-gallery:mockup-sync`** — Check alignment between COMMON.md, CLAUDE.md, and AGENTS.md


## Examples

- User types `/mockup-gallery` alone → list subcommands, ask for direction
- User types `/mockup-gallery <free-form request>` → match intent, invoke subcommand
- User types `/mockup-gallery:<specific>` → bypass this router entirely (direct invocation)

## Rules

- Prefer the most specific subcommand match. If two could fit, ask which.
- Never invent a new subcommand. Only route to ones listed above.
- If the user is describing a workflow that spans multiple subcommands, outline the sequence and ask whether to proceed.
