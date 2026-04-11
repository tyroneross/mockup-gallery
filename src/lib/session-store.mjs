// session-store.mjs — filesystem abstraction for mockup-gallery review sessions.
//
// Layout (v2):
//   <project>/mockups/sessions/<slug>/            — session content
//     session.json                                — session metadata
//     *.html                                      — main mockups
//     archive/*.html                              — archived mockups
//   <project>/.mockup-gallery/state.json          — top-level pointer
//   <project>/.mockup-gallery/sessions/<slug>/    — session state
//     selections.json                             — per-session ratings
//
// All writes are atomic (temp file + rename). All slugs are validated via
// validate.mjs#slugIsValid to reject traversal attempts.

import fs from 'node:fs';
import path from 'node:path';
import {
  validateSession,
  validateSelections,
  validateState,
  slugIsValid,
} from './validate.mjs';

// ── Internals ─────────────────────────────────────────────────────────────

function assertSlug(slug) {
  if (!slugIsValid(slug)) {
    throw new Error(`Invalid session slug: ${JSON.stringify(slug)}`);
  }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function atomicWriteJson(filePath, obj) {
  ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

function readJsonOrNull(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function sessionsContentDir(mockupDir) {
  return path.join(mockupDir, 'sessions');
}

function sessionContentDir(mockupDir, slug) {
  assertSlug(slug);
  return path.join(sessionsContentDir(mockupDir), slug);
}

function sessionJsonPath(mockupDir, slug) {
  return path.join(sessionContentDir(mockupDir, slug), 'session.json');
}

function sessionsStateDir(storageDir) {
  return path.join(storageDir, 'sessions');
}

function sessionStateDir(storageDir, slug) {
  assertSlug(slug);
  return path.join(sessionsStateDir(storageDir), slug);
}

function sessionSelectionsPath(storageDir, slug) {
  return path.join(sessionStateDir(storageDir, slug), 'selections.json');
}

function statePath(storageDir) {
  return path.join(storageDir, 'state.json');
}

function nowIso() {
  return new Date().toISOString();
}

function todayYmd() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function kebab(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function defaultSelections() {
  return {
    exported: nowIso(),
    total: 0,
    rated: 0,
    selections: [],
  };
}

function defaultState() {
  return {
    version: 2,
    currentSession: null,
    migratedFrom: null,
    migratedAt: null,
  };
}

function assertValid(validator, obj, label) {
  const result = validator(obj);
  if (!result.valid) {
    throw new Error(`${label} failed schema validation: ${result.errors.join('; ')}`);
  }
}

// ── State (top-level pointer) ─────────────────────────────────────────────

export function readState(storageDir) {
  const p = statePath(storageDir);
  if (!fs.existsSync(p)) return defaultState();
  const parsed = readJsonOrNull(p);
  if (!parsed) return defaultState();
  // Best-effort: if the file is malformed, fall back to defaults rather than
  // crashing the server. Validation is still enforced on writes.
  const { valid } = validateState(parsed);
  if (!valid) return defaultState();
  return parsed;
}

export function writeState(storageDir, state) {
  assertValid(validateState, state, 'state.json');
  atomicWriteJson(statePath(storageDir), state);
  return state;
}

// ── Session CRUD ──────────────────────────────────────────────────────────

export function sessionExists(mockupDir, slug) {
  if (!slugIsValid(slug)) return false;
  return fs.existsSync(sessionJsonPath(mockupDir, slug));
}

export function readSession(mockupDir, slug) {
  assertSlug(slug);
  const p = sessionJsonPath(mockupDir, slug);
  if (!fs.existsSync(p)) {
    throw new Error(`Session not found: ${slug}`);
  }
  const parsed = readJsonOrNull(p);
  if (!parsed) {
    throw new Error(`Session ${slug} has corrupt session.json`);
  }
  return parsed;
}

export function writeSession(mockupDir, slug, sessionObj) {
  assertSlug(slug);
  if (sessionObj?.slug !== slug) {
    throw new Error(`Session slug mismatch: path=${slug} obj=${sessionObj?.slug}`);
  }
  assertValid(validateSession, sessionObj, `session.json (${slug})`);
  ensureDir(sessionContentDir(mockupDir, slug));
  atomicWriteJson(sessionJsonPath(mockupDir, slug), sessionObj);
  return sessionObj;
}

export function listSessions(mockupDir, storageDir) {
  const dir = sessionsContentDir(mockupDir);
  if (!fs.existsSync(dir)) return [];
  const currentSlug = getCurrentSession(mockupDir, storageDir);
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!slugIsValid(entry.name)) continue;
    const slug = entry.name;
    const jsonPath = sessionJsonPath(mockupDir, slug);
    if (!fs.existsSync(jsonPath)) continue;
    const parsed = readJsonOrNull(jsonPath);
    if (!parsed) continue;
    out.push({
      slug: parsed.slug || slug,
      name: parsed.name || slug,
      goal: parsed.goal || null,
      status: parsed.status || 'active',
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      createdAt: parsed.createdAt || null,
      updatedAt: parsed.updatedAt || null,
      supersededBy: parsed.supersededBy || null,
      decision: parsed.decision || null,
      isCurrent: slug === currentSlug,
    });
  }
  out.sort((a, b) => {
    const A = a.createdAt || '';
    const B = b.createdAt || '';
    if (A === B) return a.slug.localeCompare(b.slug);
    return A < B ? 1 : -1;
  });
  return out;
}

export function createSession(mockupDir, storageDir, { name, goal, tags, slug } = {}) {
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new Error('createSession: name is required');
  }
  const cleanName = name.trim();
  const cleanGoal = typeof goal === 'string' ? goal : '';
  const cleanTags = Array.isArray(tags)
    ? tags.map((t) => String(t).toLowerCase()).filter((t) => /^[a-z0-9-]+$/.test(t))
    : [];

  let finalSlug;
  if (slug) {
    assertSlug(slug);
    if (sessionExists(mockupDir, slug)) {
      throw new Error(`Session already exists: ${slug}`);
    }
    finalSlug = slug;
  } else {
    const base = `${todayYmd()}-${kebab(cleanName) || 'session'}`;
    let candidate = base;
    let i = 2;
    while (sessionExists(mockupDir, candidate)) {
      candidate = `${base}-${i++}`;
    }
    assertSlug(candidate);
    finalSlug = candidate;
  }

  const now = nowIso();
  const sessionObj = {
    slug: finalSlug,
    name: cleanName,
    goal: cleanGoal,
    createdAt: now,
    updatedAt: now,
    status: 'active',
    tags: cleanTags,
    supersededBy: null,
    decision: null,
  };

  // Create dirs
  ensureDir(sessionContentDir(mockupDir, finalSlug));
  ensureDir(sessionStateDir(storageDir, finalSlug));

  // Write session.json + empty selections.json
  writeSession(mockupDir, finalSlug, sessionObj);
  writeSessionSelections(storageDir, finalSlug, defaultSelections());

  // Point state at new session
  const state = readState(storageDir);
  state.version = 2;
  state.currentSession = finalSlug;
  writeState(storageDir, state);

  return sessionObj;
}

// ── Selections (per session) ──────────────────────────────────────────────

export function readSessionSelections(storageDir, slug) {
  assertSlug(slug);
  const p = sessionSelectionsPath(storageDir, slug);
  if (!fs.existsSync(p)) return defaultSelections();
  const parsed = readJsonOrNull(p);
  if (!parsed) return defaultSelections();
  return parsed;
}

export function writeSessionSelections(storageDir, slug, selections) {
  assertSlug(slug);
  const obj = selections && typeof selections === 'object' ? selections : defaultSelections();
  // Backfill required fields so a caller posting a partial body still passes.
  if (typeof obj.exported !== 'string') obj.exported = nowIso();
  if (typeof obj.total !== 'number') obj.total = Array.isArray(obj.selections) ? obj.selections.length : 0;
  if (typeof obj.rated !== 'number') {
    obj.rated = Array.isArray(obj.selections)
      ? obj.selections.filter((s) => s && s.rating && s.rating !== 'unrated').length
      : 0;
  }
  if (!Array.isArray(obj.selections)) obj.selections = [];
  assertValid(validateSelections, obj, `selections.json (${slug})`);
  ensureDir(sessionStateDir(storageDir, slug));
  atomicWriteJson(sessionSelectionsPath(storageDir, slug), obj);
  return obj;
}

// ── Mockup file listing ───────────────────────────────────────────────────

export function listSessionMockups(mockupDir, slug) {
  assertSlug(slug);
  const dir = sessionContentDir(mockupDir, slug);
  const EXCLUDE = new Set(['session.json']);
  const out = { main: [], archive: [] };

  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.html')) continue;
      if (EXCLUDE.has(f)) continue;
      const full = path.join(dir, f);
      let stat;
      try { stat = fs.statSync(full); } catch { continue; }
      if (!stat.isFile()) continue;
      out.main.push({
        file: f,
        name: f.replace(/\.html$/, '').replace(/[-_]/g, ' '),
        modified: stat.mtime.toISOString(),
        modifiedMs: stat.mtimeMs,
        size: stat.size,
        archived: false,
      });
    }
  }

  const archiveDir = path.join(dir, 'archive');
  if (fs.existsSync(archiveDir)) {
    for (const f of fs.readdirSync(archiveDir)) {
      if (!f.endsWith('.html')) continue;
      const full = path.join(archiveDir, f);
      let stat;
      try { stat = fs.statSync(full); } catch { continue; }
      if (!stat.isFile()) continue;
      out.archive.push({
        file: f,
        name: f.replace(/\.html$/, '').replace(/[-_]/g, ' '),
        modified: stat.mtime.toISOString(),
        modifiedMs: stat.mtimeMs,
        size: stat.size,
        archived: true,
      });
    }
  }

  out.main.sort((a, b) => b.modifiedMs - a.modifiedMs);
  out.archive.sort((a, b) => b.modifiedMs - a.modifiedMs);
  return out;
}

// ── Path resolution ───────────────────────────────────────────────────────

export function resolveMockupPath(mockupDir, slug, filename) {
  assertSlug(slug);
  if (typeof filename !== 'string' || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return null;
  }
  const dir = sessionContentDir(mockupDir, slug);
  const mainPath = path.join(dir, filename);
  if (fs.existsSync(mainPath) && fs.statSync(mainPath).isFile()) return mainPath;
  const archivePath = path.join(dir, 'archive', filename);
  if (fs.existsSync(archivePath) && fs.statSync(archivePath).isFile()) return archivePath;
  return null;
}

// ── Current session helpers ───────────────────────────────────────────────

export function getCurrentSession(mockupDir, storageDir) {
  const state = readState(storageDir);
  const slug = state.currentSession;
  if (!slug) return null;
  if (!slugIsValid(slug)) return null;
  if (!sessionExists(mockupDir, slug)) return null;
  return slug;
}

export function setCurrentSession(mockupDir, storageDir, slug) {
  assertSlug(slug);
  if (!sessionExists(mockupDir, slug)) {
    throw new Error(`Cannot switch: session does not exist: ${slug}`);
  }
  const state = readState(storageDir);
  state.version = 2;
  state.currentSession = slug;
  writeState(storageDir, state);
  return state;
}

// ── Layout detection ──────────────────────────────────────────────────────

// Legacy flat layout: mockups dir exists with .html files directly in it AND
// there is no sessions/ subdir. In that case the UI should prompt migration
// and the server preserves the pre-v2 codepath so existing users are unaffected.
export function isLegacyFlat(mockupDir, storageDir) {
  if (!fs.existsSync(mockupDir)) return false;
  const sessionsDir = sessionsContentDir(mockupDir);
  if (fs.existsSync(sessionsDir)) {
    // If a sessions/ dir exists with at least one valid session, we're in v2.
    try {
      const entries = fs.readdirSync(sessionsDir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory() && slugIsValid(e.name) && fs.existsSync(sessionJsonPath(mockupDir, e.name))) {
          return false;
        }
      }
    } catch {}
  }
  // No sessions yet — check whether flat .html files exist in mockupDir.
  try {
    const files = fs.readdirSync(mockupDir);
    const hasFlatHtml = files.some((f) => f.endsWith('.html'));
    return hasFlatHtml;
  } catch {
    return false;
  }
}
