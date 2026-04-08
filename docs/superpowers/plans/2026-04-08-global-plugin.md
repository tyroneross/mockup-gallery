# mockup-gallery Global Plugin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make mockup-gallery installable as a global Claude Code plugin with a shared contract (COMMON.md), separate platform docs (CLAUDE.md, AGENTS.md), a project registry, global/per-project memories, and a sync check for doc alignment.

**Architecture:** Registry file + memory layer approach. Hooks use `CLAUDE_PLUGIN_ROOT` to locate the gallery repo for registry and memories, `process.cwd()` for local `.mockup-gallery/` data. COMMON.md is the shared contract; CLAUDE.md and AGENTS.md are independent platform docs that reference it.

**Tech Stack:** Node.js (ESM), markdown, JSON, Claude Code plugin system (`plugin.json`, hooks, commands)

**Spec:** `docs/superpowers/specs/2026-04-08-global-plugin-design.md`

---

## File Structure

### New Files
- `COMMON.md` — Shared contract: data schemas, behavioral rules, mockup conventions
- `CLAUDE.md` — Claude Code-specific guidance, references COMMON.md
- `AGENTS.md` — Codex/Cursor/Copilot guidance, references COMMON.md
- `.gitignore` — Ignore `registry.json`
- `memories/global/design-preferences.md` — Cross-project design preferences (starter)
- `memories/global/implementation-lessons.md` — Cross-project implementation lessons (starter)
- `sync/check-alignment.mjs` — Reads all three docs, reports drift
- `commands/mockup-memories.md` — `/mockup-memories` command
- `commands/mockup-sync.md` — `/mockup-gallery:sync` command

### Modified Files
- `plugin.json` — Add new commands, update version
- `package.json` — Update version to match
- `hooks/check-pending.mjs` — Add registry auto-registration + global memory surfacing

### Unchanged Files
- `hooks/check-shared-feedback.mjs` — No changes needed
- `hooks/check-after-mockup-edit.mjs` — No changes needed
- `server/gallery-server.mjs` — No changes needed
- `gallery/gallery.html` — No changes needed
- All files under `.claude/` — No changes needed

---

### Task 1: COMMON.md — Shared Contract

**Files:**
- Create: `COMMON.md`

This is the foundation that both CLAUDE.md and AGENTS.md will reference. Contains data schemas extracted from the existing codebase (`selections.json`, `selected.json`, `implemented.json`, `accepted-designs.json`), behavioral rules from the existing SKILL.md, and mockup format conventions.

- [ ] **Step 1: Write COMMON.md**

```markdown
# mockup-gallery — Common Instructions

Shared rules for all agents working with mockup-gallery data. Platform-specific guidance lives in CLAUDE.md (Claude Code) and AGENTS.md (Codex, Cursor, Copilot).

## Data Location

Review data lives in `.mockup-gallery/` inside each project root. Mockup HTML files live in the project's `mockups/` directory (or `docs/mockups/`, `.claude/mockups/`).

## Data Schema

### selections.json — Ratings and Notes

```json
{
  "selections": [
    {
      "file": "mockup-filename.html",
      "name": "Display Name",
      "rating": "yay | nay | unrated",
      "note": "Freeform feedback text or null",
      "components": [
        {
          "name": "ComponentName",
          "rating": "yay | nay | unrated",
          "note": "Component-specific feedback or null"
        }
      ]
    }
  ]
}
```

### selected.json — Curated Build

```json
{
  "updated": "YYYY-MM-DD",
  "pages": {
    "/route": {
      "source": "mockup-filename.html",
      "selectedAt": "YYYY-MM-DD",
      "status": "pending | done",
      "changeNote": "Description of what to change or null",
      "note": "General note or null"
    }
  },
  "components": {
    "ComponentName": {
      "source": "mockup-filename.html",
      "page": "/route | global",
      "selectedAt": "YYYY-MM-DD",
      "note": "Usage note or null"
    }
  },
  "saved": ["mockup-filename.html"]
}
```

### implemented.json — Implementation Tracking

```json
{
  "mockup-filename.html": {
    "status": "designed | partial | implemented",
    "components": {
      "ComponentName": {
        "status": "designed | implemented",
        "codeFile": "path/to/component.tsx or null"
      }
    }
  }
}
```

### accepted-designs.json — Approved/Rejected Patterns

```json
{
  "design_patterns": {
    "approved": [
      {
        "name": "PatternName",
        "source": "mockup-filename.html",
        "component": "ComponentName",
        "description": "What was approved and why"
      }
    ],
    "rejected": [
      {
        "name": "PatternName",
        "reason": "Why it was rejected"
      }
    ]
  }
}
```

## Rating Semantics

- **yay** — Approved. Ship as-is or port to production code.
- **nay** — Rejected. Do not reuse this pattern. Record in `accepted-designs.json` under rejected.
- **unrated** — Needs review. Do not implement until rated.

## Mockup Format

- Self-contained HTML files. Load Tailwind via CDN (`<script src="https://cdn.tailwindcss.com"></script>`).
- No external asset dependencies. Inline all icons as SVG.
- Label components with `data-component="ComponentName"` attributes.
- Add visible section labels: `<p class="text-xs text-gray-500 mb-2">Component: Name</p>`.
- One screen or component cluster per file. PascalCase component names.
- Variants: suffix with A/B (`CardVariantA`, `CardVariantB`).

## Behavioral Rules

1. **Read before implementing.** Always read `selections.json` and `selected.json` before implementing UI changes.
2. **Respect ratings.** Never implement unrated mockups. Never reuse rejected patterns.
3. **Don't override approved patterns** without explicit user instruction.
4. **Version, don't overwrite.** Create `v2`, `v3` files when iterating — don't overwrite originals.
5. **Scope changes to descriptions.** If a `changeNote` exists on a selected page, only modify the aspects described. Don't restructure parts of the UI not mentioned.
6. **Compare before building.** Compare mockup HTML against current implementation to identify deltas.

## Memories

Global design memories live in the mockup-gallery plugin repo under `memories/`. Two tiers:

- `memories/global/` — Preferences and lessons that apply to all projects.
- `memories/projects/<project-name>/` — Overrides specific to one project.

Per-project memories take precedence over global when both exist. Memories are markdown files, readable by any agent.
```

- [ ] **Step 2: Verify COMMON.md is self-contained**

Read the file back. Confirm: no TBDs, no references to platform-specific features, all four JSON schemas present with field definitions, all behavioral rules stated.

- [ ] **Step 3: Commit**

```bash
git add COMMON.md
git commit -m "docs: add COMMON.md shared contract for all agents"
```

---

### Task 2: AGENTS.md — Codex/Multi-Agent Guidance

**Files:**
- Create: `AGENTS.md`

Standalone guidance for Codex, Cursor, Copilot. References COMMON.md. No plugin dependency — pure filesystem interaction.

- [ ] **Step 1: Write AGENTS.md**

```markdown
# mockup-gallery

Guidance for AI coding agents (Codex, Cursor, Copilot, Gemini CLI) working with projects that use mockup-gallery for design review.

See [COMMON.md](COMMON.md) for data formats, behavioral rules, and mockup conventions shared across all platforms.

## What This Is

mockup-gallery is a design review system for HTML mockups. Users rate mockups in a browser-based gallery, and agents read the review data to implement approved designs.

## Finding Review Data

Look for `.mockup-gallery/` in the project root. If it exists, this project has active design review data.

```
.mockup-gallery/
  selections.json       — Ratings and notes per mockup
  selected.json         — Curated build: which mockups map to which pages
  implemented.json      — Implementation tracking per component
  accepted-designs.json — Approved/rejected design patterns
```

All file formats are documented in COMMON.md.

## Finding Mockups

HTML mockup files live in the project (not in `.mockup-gallery/`). Check these directories:
1. `mockups/`
2. `docs/mockups/`
3. `.claude/mockups/`

## Before Implementing UI Changes

1. Read `.mockup-gallery/selections.json` — check what's been rated and what feedback exists.
2. Read `.mockup-gallery/selected.json` — check which mockups are assigned to which pages.
3. If a page has `status: "pending"` and a `changeNote`, implement only the described changes.
4. If a page has `status: "done"`, do not re-implement unless explicitly asked.
5. Read the actual mockup HTML file (`mockups/<source>`) to understand the target design.

## Creating Mockups

Follow the format in COMMON.md:
- Self-contained HTML with Tailwind CDN
- `data-component` attributes on every distinct section
- Visible component labels
- One screen per file

## Global Memories

If the mockup-gallery plugin is installed, global design memories are at:
- `<plugin-root>/memories/global/design-preferences.md`
- `<plugin-root>/memories/global/implementation-lessons.md`
- `<plugin-root>/memories/projects/<project-name>/design-preferences.md`

These are optional context. If you can access them, read before making design decisions. If not, proceed with project-local data only.

## No Plugin Required

This file and `.mockup-gallery/` data are all you need. The Claude Code plugin adds hooks and commands for convenience, but the data format is the shared interface. Read the files, follow the rules in COMMON.md.
```

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: add AGENTS.md for Codex/Cursor/Copilot agents"
```

---

### Task 3: CLAUDE.md — Claude Code Guidance

**Files:**
- Create: `CLAUDE.md`

Claude Code-specific guidance. References COMMON.md. Documents hooks, commands, skills, memory workflow.

- [ ] **Step 1: Write CLAUDE.md**

```markdown
# mockup-gallery — Claude Code

See [COMMON.md](COMMON.md) for data formats, behavioral rules, and mockup conventions.

## Plugin Installation

```bash
claude plugin add /path/to/mockup-gallery
```

## Commands

| Command | Purpose |
|---------|---------|
| `/mockup-review` | Launch gallery server for the current project |
| `/mockup-status` | Show review progress inline |
| `/mockup-feedback` | Pull latest ratings, comments, selections |
| `/mockup-selections` | Full structured output of all design decisions |
| `/mockup-memories` | Show global + project-specific design memories |
| `/mockup-memories promote` | Promote a learning to global or project memory |
| `/mockup-gallery:sync` | Check alignment between COMMON.md, CLAUDE.md, AGENTS.md |

## Hooks

**SessionStart** — Surfaces:
- Review status (ratings, pending items, implementation progress)
- Pending design changes to implement
- Relevant global memories (design preferences, implementation lessons)

**UserPromptSubmit** — Delivers pending feedback from the gallery's "Share with Claude" button (one-shot, auto-deletes after reading).

**PostToolUse (Write|Edit)** — When editing mockup HTML files, surfaces relevant feedback for that specific mockup.

## Skills

**mockup-review** — Full design review workflow: creating mockups, reading feedback, iterating, consolidating approved designs. Load this skill before creating or implementing mockups.

## Memories

Global memories live in the plugin repo under `memories/`.

- `memories/global/design-preferences.md` — Cross-project visual rules
- `memories/global/implementation-lessons.md` — What worked/failed across projects
- `memories/projects/<name>/design-preferences.md` — Project-specific overrides

Use `/mockup-memories` to view. Use `/mockup-memories promote` to promote local learnings.

Per-project memories override global when both address the same topic.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add CLAUDE.md for Claude Code plugin guidance"
```

---

### Task 4: .gitignore and Memories Scaffold

**Files:**
- Create: `.gitignore`
- Create: `memories/global/design-preferences.md`
- Create: `memories/global/implementation-lessons.md`

- [ ] **Step 1: Create .gitignore**

```
registry.json
node_modules/
```

- [ ] **Step 2: Create global memories starter files**

`memories/global/design-preferences.md`:
```markdown
# Global Design Preferences

Design preferences that apply across all projects using mockup-gallery.

<!-- Add entries as they are promoted from project reviews -->
```

`memories/global/implementation-lessons.md`:
```markdown
# Implementation Lessons

Lessons learned from implementing designs across projects.

<!-- Add entries as they are promoted from project reviews -->
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore memories/
git commit -m "feat: add .gitignore (registry ignored) and global memories scaffold"
```

---

### Task 5: Registry Auto-Registration in SessionStart Hook

**Files:**
- Modify: `hooks/check-pending.mjs:1-118`

Add registry auto-registration at the top of the hook. Uses `CLAUDE_PLUGIN_ROOT` env var (set by Claude Code when running plugin hooks) to locate the gallery repo. Also surfaces global memories after the existing status output.

- [ ] **Step 1: Read the current hook to confirm exact structure**

Read `hooks/check-pending.mjs` in full. Confirm the existing logic ends with `process.stdout.write(lines.join('\n') + '\n');` at line 118.

- [ ] **Step 2: Add registry helper function and memory surfacing**

Add at the top of the file, after existing imports:

```javascript
import { writeFileSync, mkdirSync } from 'fs';

// ── Registry auto-registration ──────────────────────────────────────────
function registerProject(pluginRoot, projectPath) {
  if (!pluginRoot) return;
  const registryPath = join(pluginRoot, 'registry.json');
  let registry = { projects: {} };
  try { registry = JSON.parse(readFileSync(registryPath, 'utf8')); } catch { /* new registry */ }
  const name = projectPath.split('/').pop();
  registry.projects[name] = {
    path: projectPath,
    lastSeen: new Date().toISOString()
  };
  try {
    writeFileSync(registryPath, JSON.stringify(registry, null, 2));
  } catch { /* silent — registry is optional */ }
}

// ── Global memory reader ────────────────────────────────────────────────
function readGlobalMemories(pluginRoot, projectName) {
  if (!pluginRoot) return [];
  const memLines = [];
  const globalDir = join(pluginRoot, 'memories', 'global');
  const projectDir = join(pluginRoot, 'memories', 'projects', projectName);

  for (const dir of [globalDir, projectDir]) {
    if (!existsSync(dir)) continue;
    try {
      const files = readdirSync(dir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const content = readFileSync(join(dir, file), 'utf8').trim();
        // Skip files that only have the starter template
        if (content.includes('<!-- Add entries as they are promoted')) continue;
        const label = dir === globalDir ? 'Global' : `Project (${projectName})`;
        memLines.push(`  ${label}: ${file.replace('.md', '').replace(/-/g, ' ')}`);
      }
    } catch { /* silent */ }
  }
  return memLines;
}
```

Update the imports line at the top:
```javascript
import { readFileSync, existsSync, writeFileSync, readdirSync } from 'fs';
```

- [ ] **Step 3: Wire registration into the hook body**

After the existing `if (!existsSync(selectionsPath) && !existsSync(selectedPath)) process.exit(0);` line (line 15), add:

```javascript
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || null;
const projectPath = process.cwd();
const projectName = projectPath.split('/').pop();

// Auto-register this project (silent)
registerProject(pluginRoot, projectPath);
```

- [ ] **Step 4: Add memory surfacing at the end**

Before the final `process.stdout.write(lines.join('\n') + '\n');`, add:

```javascript
// Surface global memories if any have content
const memLines = readGlobalMemories(pluginRoot, projectName);
if (memLines.length > 0) {
  lines.push('  Design memories:');
  lines.push(...memLines);
}
```

- [ ] **Step 5: Test the hook manually**

```bash
cd /Users/tyroneross/Desktop/git-folder/mockup-gallery
CLAUDE_PLUGIN_ROOT="$(pwd)" node hooks/check-pending.mjs
```

Expected: exits silently (no `.mockup-gallery/` in the gallery repo itself). No crash.

- [ ] **Step 6: Test with a project that has gallery data**

```bash
cd /Users/tyroneross/Desktop/git-folder/atomize-ai
CLAUDE_PLUGIN_ROOT="/Users/tyroneross/Desktop/git-folder/mockup-gallery" node /Users/tyroneross/Desktop/git-folder/mockup-gallery/hooks/check-pending.mjs
```

Expected: existing status output appears. Check that `registry.json` was created in the mockup-gallery repo with an `atomize-ai` entry.

- [ ] **Step 7: Commit**

```bash
cd /Users/tyroneross/Desktop/git-folder/mockup-gallery
git add hooks/check-pending.mjs
git commit -m "feat: auto-register projects and surface global memories on SessionStart"
```

---

### Task 6: mockup-memories Command

**Files:**
- Create: `commands/mockup-memories.md`
- Modify: `plugin.json`

- [ ] **Step 1: Write the command file**

`commands/mockup-memories.md`:
```markdown
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
```

- [ ] **Step 2: Add command to plugin.json**

Add to the `commands` object in `plugin.json`:

```json
"mockup-memories": {
  "description": "Show global and project-specific design memories, or promote learnings",
  "file": "commands/mockup-memories.md"
}
```

- [ ] **Step 3: Commit**

```bash
git add commands/mockup-memories.md plugin.json
git commit -m "feat: add /mockup-memories command for viewing and promoting design memories"
```

---

### Task 7: mockup-gallery:sync Command

**Files:**
- Create: `commands/mockup-sync.md`
- Create: `sync/check-alignment.mjs`
- Modify: `plugin.json`

- [ ] **Step 1: Write the sync check script**

`sync/check-alignment.mjs`:
```javascript
#!/usr/bin/env node
/**
 * Reads COMMON.md, CLAUDE.md, and AGENTS.md from the plugin root.
 * Extracts section headings and key terms from COMMON.md,
 * checks whether each platform doc references them.
 * Outputs a structured drift report.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const root = process.env.CLAUDE_PLUGIN_ROOT || process.argv[2] || process.cwd();

const commonPath = join(root, 'COMMON.md');
const claudePath = join(root, 'CLAUDE.md');
const agentsPath = join(root, 'AGENTS.md');

function readFile(p) {
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf8');
}

const common = readFile(commonPath);
const claude = readFile(claudePath);
const agents = readFile(agentsPath);

if (!common) {
  console.error('COMMON.md not found at ' + commonPath);
  process.exit(1);
}

const gaps = [];

// Extract ## headings from COMMON.md as key sections
const sections = [];
for (const line of common.split('\n')) {
  const match = line.match(/^##\s+(.+)/);
  if (match) sections.push(match[1].trim());
}

// Extract key terms: JSON filenames, rating values, behavioral rule keywords
const keyTerms = [
  'selections.json', 'selected.json', 'implemented.json', 'accepted-designs.json',
  'yay', 'nay', 'unrated',
  'data-component',
  'changeNote',
  'COMMON.md'
];

// Check each platform doc
for (const [name, content] of [['CLAUDE.md', claude], ['AGENTS.md', agents]]) {
  if (!content) {
    gaps.push({ doc: name, issue: 'File missing', section: 'all' });
    continue;
  }

  // Check COMMON.md reference
  if (!content.includes('COMMON.md')) {
    gaps.push({ doc: name, issue: 'Does not reference COMMON.md', section: 'header' });
  }

  // Check key terms coverage
  for (const term of keyTerms) {
    if (common.includes(term) && !content.includes(term)) {
      // Not every term needs to be in platform docs — only flag data file names
      if (term.endsWith('.json')) {
        gaps.push({ doc: name, issue: `No mention of "${term}"`, section: 'Data Schema' });
      }
    }
  }
}

// Cross-check: terms in one platform doc but not the other
if (claude && agents) {
  for (const term of keyTerms) {
    const inClaude = claude.includes(term);
    const inAgents = agents.includes(term);
    if (inClaude && !inAgents) {
      gaps.push({ doc: 'AGENTS.md', issue: `CLAUDE.md mentions "${term}" but AGENTS.md does not`, section: 'cross-check' });
    }
    if (inAgents && !inClaude) {
      gaps.push({ doc: 'CLAUDE.md', issue: `AGENTS.md mentions "${term}" but CLAUDE.md does not`, section: 'cross-check' });
    }
  }
}

// Output
if (gaps.length === 0) {
  console.log('All docs aligned. No drift detected.');
} else {
  console.log(`Found ${gaps.length} alignment gap(s):\n`);
  for (const gap of gaps) {
    console.log(`  [${gap.doc}] ${gap.issue}`);
    console.log(`    Section: ${gap.section}`);
    console.log('');
  }
  console.log('Review each gap and update the relevant doc. COMMON.md is the source of truth.');
}
```

- [ ] **Step 2: Write the command file**

`commands/mockup-sync.md`:
```markdown
---
name: mockup-gallery:sync
description: Check alignment between COMMON.md, CLAUDE.md, and AGENTS.md
user_invocable: true
---

Run the sync check:

```bash
node "${CLAUDE_PLUGIN_ROOT}/sync/check-alignment.mjs"
```

If gaps are found:
1. Show the output to the user
2. For each gap, read the relevant section of COMMON.md and the platform doc
3. Suggest a specific patch (the actual text to add or change) for each platform doc
4. Ask the user which patches to apply

If no gaps found, report "All docs aligned."
```

- [ ] **Step 3: Add command to plugin.json**

Add to the `commands` object:

```json
"mockup-gallery:sync": {
  "description": "Check alignment between COMMON.md, CLAUDE.md, and AGENTS.md",
  "file": "commands/mockup-sync.md"
}
```

- [ ] **Step 4: Test the sync script**

```bash
cd /Users/tyroneross/Desktop/git-folder/mockup-gallery
CLAUDE_PLUGIN_ROOT="$(pwd)" node sync/check-alignment.mjs
```

Expected: either "All docs aligned" or a list of specific gaps with doc name and section.

- [ ] **Step 5: Commit**

```bash
git add sync/ commands/mockup-sync.md plugin.json
git commit -m "feat: add /mockup-gallery:sync command and alignment check script"
```

---

### Task 8: Update plugin.json Version and package.json Version

**Files:**
- Modify: `plugin.json:2`
- Modify: `package.json:3`

- [ ] **Step 1: Bump plugin.json version to 0.4.0**

Change `"version": "0.3.0"` to `"version": "0.4.0"` in `plugin.json`.

- [ ] **Step 2: Bump package.json version to 0.4.0**

Change `"version": "0.2.0"` to `"version": "0.4.0"` in `package.json`.

- [ ] **Step 3: Verify plugin.json has all commands**

The final `commands` section should have:
```json
"commands": {
  "mockup-feedback": { ... },
  "mockup-memories": { ... },
  "mockup-gallery:sync": { ... }
}
```

- [ ] **Step 4: Commit**

```bash
git add plugin.json package.json
git commit -m "chore: bump version to 0.4.0 for global plugin release"
```

---

### Task 9: End-to-End Validation

- [ ] **Step 1: Verify plugin structure**

```bash
cd /Users/tyroneross/Desktop/git-folder/mockup-gallery
ls COMMON.md CLAUDE.md AGENTS.md plugin.json package.json .gitignore
ls memories/global/design-preferences.md memories/global/implementation-lessons.md
ls sync/check-alignment.mjs
ls commands/mockup-memories.md commands/mockup-sync.md commands/mockup-feedback.md
```

Expected: all files exist.

- [ ] **Step 2: Verify registry is gitignored**

```bash
echo '{}' > registry.json
git status
```

Expected: `registry.json` does NOT appear in `git status` output. Clean up: `rm registry.json`.

- [ ] **Step 3: Run sync check**

```bash
CLAUDE_PLUGIN_ROOT="$(pwd)" node sync/check-alignment.mjs
```

Expected: report runs without error. Review any gaps and determine if they are acceptable or need fixing.

- [ ] **Step 4: Verify hook runs without error**

```bash
CLAUDE_PLUGIN_ROOT="$(pwd)" node hooks/check-pending.mjs
```

Expected: exits cleanly (no `.mockup-gallery/` in gallery repo = silent exit).

- [ ] **Step 5: Verify plugin.json is valid JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('plugin.json','utf8')); console.log('valid')"
```

Expected: `valid`

- [ ] **Step 6: Verify COMMON.md is referenced by both platform docs**

```bash
grep -l 'COMMON.md' CLAUDE.md AGENTS.md
```

Expected: both files listed.

- [ ] **Step 7: Final commit if any fixes were needed**

Only if validation uncovered issues that required changes.
