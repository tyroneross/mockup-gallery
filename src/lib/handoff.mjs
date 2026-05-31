// handoff.mjs — per-selection implementation handoff artifact emitter.
//
// When a user selects a page in the gallery (POST /selected), we emit a
// Markdown file per route to `.mockup-gallery/handoff/<route-slug>.md` (or
// the session-scoped equivalent). The artifact is a structured template:
// frontmatter carries route/source/timestamps and field placeholders; the
// markdown body has the canonical sections (Components, Data Elements,
// Connectors / APIs, States, Open Questions) for the host coding agent to
// fill from the source mockup HTML.
//
// We do NOT parse HTML here. The host agent (Claude / Codex) reads the
// `data-component` markup in the source file and updates this artifact. This
// matches the project's "host agent is the LLM" principle: provide
// structured scaffolding + instructions, let the host reason.
//
// Idempotency: when a handoff file already exists, regenerate is OFF by
// default so agent-filled content is never clobbered. Pass `regenerate:true`
// to overwrite.

import fs from 'node:fs';
import path from 'node:path';

export const HANDOFF_FORMAT_VERSION = 1;

// ── Slug helpers ──────────────────────────────────────────────────────────

// Route → filename slug. "/" → "root", "/search" → "search",
// "/admin/users/[id]" → "admin-users-id".
export function routeToSlug(route) {
  if (typeof route !== 'string') return null;
  const trimmed = route.trim();
  if (!trimmed) return null;
  // Normalize a string of only slashes to "/", which maps to "root".
  if (/^\/+$/.test(trimmed)) return 'root';
  const slug = trimmed
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .toLowerCase()
    .replace(/[\[\]]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || null;
}

// ── Directory layout ──────────────────────────────────────────────────────

// Returns the absolute handoff directory for a project, scoped to the active
// session when one is provided. Caller decides whether to mkdir.
export function handoffDir(storageDir, { sessionSlug = null } = {}) {
  if (sessionSlug) {
    return path.join(storageDir, 'sessions', sessionSlug, 'handoff');
  }
  return path.join(storageDir, 'handoff');
}

export function handoffPath(storageDir, route, { sessionSlug = null } = {}) {
  const slug = routeToSlug(route);
  if (!slug) return null;
  return path.join(handoffDir(storageDir, { sessionSlug }), `${slug}.md`);
}

// ── Template ──────────────────────────────────────────────────────────────

function renderHandoff({ route, slug, entry, sessionSlug }) {
  const source = entry?.source || '';
  const selectedAt = entry?.selectedAt || new Date().toISOString().split('T')[0];
  const status = entry?.status || 'pending';
  const changeNote = entry?.changeNote || '';
  const note = entry?.note || '';
  const primary = entry?.primary ? 'true' : 'false';
  const session = sessionSlug || '';

  return `---
schema: mockup-gallery-handoff
schemaVersion: ${HANDOFF_FORMAT_VERSION}
route: ${JSON.stringify(route)}
slug: ${slug}
source: ${JSON.stringify(source)}
session: ${JSON.stringify(session)}
selectedAt: ${JSON.stringify(selectedAt)}
status: ${JSON.stringify(status)}
primary: ${primary}
changeNote: ${JSON.stringify(changeNote)}
note: ${JSON.stringify(note)}
filled: false
---

# Implementation Handoff — \`${route}\`

> **For the host coding agent (Claude / Codex / Cursor / etc.):** Read the
> source mockup at \`${source || '<source unset>'}\` (resolved under the
> active session's mockup directory) and fill the sections below. Each
> \`data-component\` block in the source needs an entry under **Components**
> with a classification, data source, behaviors, and states. When you have
> populated this file, flip \`filled: true\` in the frontmatter.

## Source

- **Route:** \`${route}\`
- **Mockup file:** \`${source || '<unset>'}\`
${session ? `- **Session:** \`${session}\`\n` : ''}- **Selected at:** ${selectedAt}
- **Status:** ${status}
${changeNote ? `- **Change note:** ${changeNote}\n` : ''}${note ? `- **Note:** ${note}\n` : ''}

## Components

For every \`data-component="..."\` section in the source mockup, classify each
visible element. Use this table (one block per component):

\`\`\`
### <ComponentName>

| Element | Classification | Source | Field path | Notes |
|---------|----------------|--------|-----------|-------|
|         |                |        |           |       |
\`\`\`

Classifications:

- **static** — literal copy, label, decoration, fixed layout
- **dynamic** — value / list / status / count / date / user data / remote data
- **computed** — derived total, average, percentage, trend, formatted value
- **userInput** — field or control the user edits
- **action** — click / submit / navigation / mutation / export / share / open modal
- **unknown** — must be asked before implementation

## Data Elements

For every dynamic / computed / userInput element above, capture:

- UI location and component
- Source type: \`api\` | \`store\` | \`db\` | \`local\` | \`prop\` | \`static\` | \`unknown\`
- Source name / path / field path
- Input or output schema if known
- Loading / empty / error / success behavior

## Connectors / APIs

For every \`action\` or remote-data element, capture the connector contract:

- HTTP method + path
- Query params / body shape
- Response shape
- Auth requirement
- Error handling expectations

## Visualizations

For any chart / graph / sparkline / timeline, capture:

- Data series + units
- Mark type (line / bar / area / scatter / heatmap)
- x / y / color / size encodings
- Aggregation (sum / avg / count / percentile)
- Tooltip content

## States

- **Loading:** describe placeholder, skeleton, or progress treatment.
- **Empty:** describe the no-data state and any CTA.
- **Error:** describe failure messaging and recovery.
- **Success:** describe the populated state if non-obvious.

## Open Questions

List unresolved decisions, missing data sources, ambiguous behaviors, or
visual ambiguities here. The implementer should resolve every item before
shipping.

- [ ]
`;
}

// ── Emit ──────────────────────────────────────────────────────────────────

// Reads `selected.json` shape and emits handoff/*.md per route entry.
// Returns { written: [paths], skipped: [{path, reason}], errors: [{path, error}] }.
// `regenerate:false` (default) preserves agent-filled files; `true` overwrites.
// Atomic writes: temp + rename, never partial.
export function emitHandoffsForSelection(storageDir, selected, {
  sessionSlug = null,
  regenerate = false,
} = {}) {
  const result = { written: [], skipped: [], errors: [] };
  if (!selected || typeof selected !== 'object') return result;
  const pages = selected.pages;
  if (!pages || typeof pages !== 'object') return result;

  const dir = handoffDir(storageDir, { sessionSlug });
  try { fs.mkdirSync(dir, { recursive: true }); }
  catch (e) {
    result.errors.push({ path: dir, error: e.message });
    return result;
  }

  // Track which slugs we wrote this pass so a route appearing twice doesn't
  // step on itself (last write wins for that route).
  const seen = new Set();

  for (const [route, value] of Object.entries(pages)) {
    const slug = routeToSlug(route);
    if (!slug) {
      result.skipped.push({ path: route, reason: 'invalid route' });
      continue;
    }
    const filePath = path.join(dir, `${slug}.md`);

    // Choose the "primary" entry when the route holds multiple candidates,
    // else the first entry. The handoff is per route, not per candidate;
    // teams iterate by editing the file, not by emitting duplicates.
    const entries = Array.isArray(value) ? value : (value ? [value] : []);
    if (entries.length === 0) {
      result.skipped.push({ path: filePath, reason: 'no entries for route' });
      continue;
    }
    const entry = entries.find((e) => e && e.primary) || entries[0];

    if (fs.existsSync(filePath) && !regenerate) {
      result.skipped.push({ path: filePath, reason: 'exists; pass regenerate:true to overwrite' });
      continue;
    }

    const contents = renderHandoff({ route, slug, entry, sessionSlug });
    try {
      const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
      fs.writeFileSync(tmp, contents, 'utf8');
      fs.renameSync(tmp, filePath);
      seen.add(slug);
      result.written.push(filePath);
    } catch (e) {
      result.errors.push({ path: filePath, error: e.message });
    }
  }

  return result;
}

// ── Read helpers ──────────────────────────────────────────────────────────

export function listHandoffs(storageDir, { sessionSlug = null } = {}) {
  const dir = handoffDir(storageDir, { sessionSlug });
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.join(dir, f));
}
