---
name: mockup-memories
description: Show global and project-specific design memories, or promote learnings
user_invocable: true
allowed_tools: Read, Write, Glob, Grep
---

Check the argument. If "promote" was passed, go to the Promote section. Otherwise, show memories.

## Show Memories

1. Read all `.md` files in `${CLAUDE_PLUGIN_ROOT}/memories/global/`.
2. Determine the current project name (basename of current working directory).
3. Read all `.md` files in `${CLAUDE_PLUGIN_ROOT}/memories/projects/<project-name>/` if the directory exists.
4. Display:
   - **Global Memories** — each file's content (skip files that only contain the starter template)
   - **Project Memories (<name>)** — each file's content
   - If no memories have content yet, say "No design memories recorded yet. Use `/mockup-memories promote` after a review session to save learnings."

## Promote

Ask the user:
1. "What did you learn?" — get the learning text
2. "Is this global (applies to all projects) or specific to <project-name>?" — determine tier
3. "Is this a design preference or an implementation lesson?" — determine file

Then append the learning as a new entry to the appropriate file:
- Global: `${CLAUDE_PLUGIN_ROOT}/memories/global/<design-preferences|implementation-lessons>.md`
- Project: `${CLAUDE_PLUGIN_ROOT}/memories/projects/<project-name>/<design-preferences|implementation-lessons>.md`

Create the project directory and file if they don't exist. Format the entry as:

```markdown
## <Short Title>

<Learning text>

*Promoted from <project-name> on <date>*
```
