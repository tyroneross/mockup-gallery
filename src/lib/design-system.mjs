// design-system.mjs — Google DESIGN.md (alpha) read / detect / scaffold.
//
// Spec: github.com/google-labs-code/design.md/blob/main/docs/spec.md
//
// A project's DESIGN.md lives at the project root and is the source of
// visual-identity truth for mockups and implementations. The file has two
// parts:
//
//   ---
//   <YAML front matter: machine-readable design tokens>
//   ---
//   <Markdown body: human-readable rationale in ## sections>
//
// We do NOT need a full YAML parser to detect presence or scaffold a starter;
// detection only needs the delimiter boundaries and a best-effort top-level
// key sniff. Tokens are filled by the host coding agent (Claude / Codex),
// not by this module — the host agent is the LLM.

import fs from 'node:fs';
import path from 'node:path';

export const DESIGN_FILENAME = 'DESIGN.md';

// Canonical section order per spec. Kept here for the scaffold writer + the
// drift checker so both stay aligned.
export const SECTION_ORDER = [
  'Overview',
  'Colors',
  'Typography',
  'Layout',
  'Elevation & Depth',
  'Shapes',
  'Components',
  "Do's and Don'ts",
];

// ── Detection ─────────────────────────────────────────────────────────────

export function designPath(projectRoot) {
  return path.join(projectRoot, DESIGN_FILENAME);
}

// Returns { present, path, hasFrontmatter, sections } without throwing.
// `sections` is the list of `## ` headings parsed from the markdown body so
// downstream tools can flag missing sections without parsing prose.
export function detectDesignSystem(projectRoot) {
  const p = designPath(projectRoot);
  if (!fs.existsSync(p)) {
    return { present: false, path: p, hasFrontmatter: false, sections: [] };
  }
  let raw;
  try { raw = fs.readFileSync(p, 'utf8'); } catch { return { present: false, path: p, hasFrontmatter: false, sections: [] }; }

  const { frontmatter, body } = splitFrontmatter(raw);
  const sections = extractSections(body);
  return {
    present: true,
    path: p,
    hasFrontmatter: frontmatter !== null,
    frontmatterRaw: frontmatter,
    sections,
  };
}

// Splits a DESIGN.md string into { frontmatter, body }. Returns
// frontmatter=null when no leading `---` block is present so callers can
// distinguish "no frontmatter" from "empty frontmatter".
export function splitFrontmatter(raw) {
  if (typeof raw !== 'string') return { frontmatter: null, body: '' };
  // The spec requires the file to BEGIN with `---` for a frontmatter block,
  // followed by another `---` line to close.
  if (!raw.startsWith('---')) return { frontmatter: null, body: raw };
  const lines = raw.split(/\r?\n/);
  if (lines[0].trim() !== '---') return { frontmatter: null, body: raw };
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { end = i; break; }
  }
  if (end === -1) return { frontmatter: null, body: raw };
  const frontmatter = lines.slice(1, end).join('\n');
  const body = lines.slice(end + 1).join('\n');
  return { frontmatter, body };
}

export function extractSections(body) {
  const out = [];
  if (typeof body !== 'string') return out;
  for (const line of body.split(/\r?\n/)) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) out.push(m[1]);
  }
  return out;
}

// ── Scaffold ──────────────────────────────────────────────────────────────

export function scaffoldDesignSystem(projectRoot, { name, force = false } = {}) {
  const p = designPath(projectRoot);
  if (fs.existsSync(p) && !force) {
    return { ok: false, exists: true, path: p, reason: 'DESIGN.md already exists; pass force:true to overwrite' };
  }
  const projectName = (typeof name === 'string' && name.trim()) ? name.trim() : path.basename(projectRoot);
  const contents = renderScaffold(projectName);
  // Atomic write — temp file + rename.
  const tmp = `${p}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, contents, 'utf8');
  fs.renameSync(tmp, p);
  return { ok: true, exists: false, path: p, bytes: contents.length };
}

function renderScaffold(projectName) {
  // Tokens are intentionally empty/placeholder. The host coding agent fills
  // them by reading the project's existing visual conventions (Tailwind
  // config, design system, screenshots, sample mockups, brand guidance).
  // Spec source: github.com/google-labs-code/design.md
  return `---
version: alpha
name: ${projectName}
# Fill these tokens by inspecting the project's actual styling
# (Tailwind config, CSS variables, brand guidelines, sample screens).
# The host coding agent (Claude / Codex / etc.) should populate values;
# this module only scaffolds the structure.
colors:
  primary: ""
  secondary: ""
  tertiary: ""
  neutral: ""
typography:
  h1:
    fontFamily: ""
    fontSize: ""
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: ""
  body-md:
    fontFamily: ""
    fontSize: ""
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: ""
  label:
    fontFamily: ""
    fontSize: ""
    fontWeight: 500
    lineHeight: 1
    letterSpacing: ""
spacing:
  xs: ""
  sm: ""
  md: ""
  lg: ""
  xl: ""
rounded:
  sm: ""
  md: ""
  lg: ""
  full: ""
---

# ${projectName} — Design System

This file is the visual-identity source of truth for ${projectName}. It is
read by mockup-gallery and by AI coding agents (Claude Code, Codex, Cursor,
etc.) when generating mockups or implementing UI so they apply consistent
colors, typography, spacing, and component patterns.

This file describes **visual identity only** — colors, typography, spacing,
elevation, shape, component appearance. Interaction behavior, data bindings,
loading/empty/error states, and connector contracts belong in the per-page
implementation handoff specs under \`.mockup-gallery/handoff/\`.

Format: [Google DESIGN.md alpha](https://github.com/google-labs-code/design.md).

## Overview

Describe the brand personality, target audience, and the emotional response
the UI should evoke (playful or professional, dense or spacious, etc.).
This serves as foundational context when a specific rule or token is not
defined.

## Colors

Describe the palette in prose. Reference each token by its descriptive name
and hex; the canonical machine-readable values live in the YAML frontmatter.

- **Primary** — _describe role and feel_.
- **Secondary** — _describe role and feel_.
- **Tertiary** — _describe role and feel_.
- **Neutral** — _describe role and feel_.

## Typography

Describe the type strategy in prose: which families do what, how weights and
sizes carry hierarchy, and any voice/tone implications. The numeric values
live in the YAML frontmatter under \`typography\`.

## Layout

Describe spacing strategy, grid usage, margins, safe areas, and density. The
canonical scale lives in the YAML frontmatter under \`spacing\`.

## Elevation & Depth

Describe how elevation, shadows, and layering communicate hierarchy and
focus. Include z-index conventions if the product uses overlays heavily.

## Shapes

Describe corner-radius conventions and any signature shape language. The
canonical radius scale lives in the YAML frontmatter under \`rounded\`.

## Components

Describe component appearance conventions (buttons, inputs, cards, nav).
Behavior conventions belong in the implementation handoff specs.

## Do's and Don'ts

- **Do** prefer one primary action per screen.
- **Do** keep mockups in this token palette unless intentionally exploring an
  alternative direction.
- **Don't** introduce new color or type tokens without recording them here.
- **Don't** restyle approved components without recording the change here.
`;
}
