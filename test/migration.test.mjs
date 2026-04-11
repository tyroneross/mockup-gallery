// Grader 2: Migration preserves data
//
// Verifies migrateFlatToSessions() behavior:
//   - dry-run does not touch the filesystem
//   - real migration moves files and writes session.json / state.json
//   - byte-identical selections.json (and friends) after migration
//   - idempotency: second run returns already-migrated
//   - empty dir: returns no-mockups-found
//
// Run: node --test test/migration.test.mjs

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrateFlatToSessions } from '../src/lib/migrate-flat-to-sessions.mjs';
import { validateSession } from '../src/lib/validate.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(here, 'fixtures/flat-unmigrated');

// Track tmp dirs to clean up at the end of the run
const tmpDirs = [];

function copyFixtureToTmp(label) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `mg-${label}-`));
  fs.cpSync(fixtureRoot, tmp, { recursive: true });
  tmpDirs.push(tmp);
  return tmp;
}

// Walk a directory tree and return a sorted list of [relPath, size, sha-like]
// for diffing before/after. We use mtime-insensitive fingerprint: path + size + first bytes.
function snapshot(root) {
  const out = [];
  function walk(dir, rel) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const r = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        out.push({ path: r + '/', kind: 'dir' });
        walk(full, r);
      } else if (entry.isFile()) {
        const content = fs.readFileSync(full);
        out.push({ path: r, kind: 'file', size: content.length, head: content.slice(0, 64).toString('hex') });
      }
    }
  }
  walk(root, '');
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

after(() => {
  for (const d of tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
  }
});

test('migration: dry-run does not mutate the filesystem', () => {
  const tmp = copyFixtureToTmp('dryrun');
  const before = snapshot(tmp);
  const result = migrateFlatToSessions({ projectRoot: tmp, dryRun: true });
  const afterSnap = snapshot(tmp);

  assert.equal(result.migrated, false, 'dry-run should report migrated=false');
  assert.equal(result.reason, 'dry-run');
  assert.ok(Array.isArray(result.moves) && result.moves.length > 0, 'dry-run should still plan moves');
  assert.deepEqual(afterSnap, before, 'filesystem must be byte-identical after dry-run');
});

test('migration: real migration creates session.json and state.json', () => {
  const tmp = copyFixtureToTmp('real');
  const result = migrateFlatToSessions({ projectRoot: tmp });

  assert.equal(result.migrated, true);
  assert.equal(result.reason, 'migrated-flat-to-sessions');
  assert.ok(result.slug && /^legacy-\d{4}-\d{2}-\d{2}$/.test(result.slug));

  // session.json exists and validates
  const sessionJsonPath = path.join(tmp, 'mockups/sessions', result.slug, 'session.json');
  assert.ok(fs.existsSync(sessionJsonPath), 'session.json should exist under mockups/sessions/<slug>/');
  const session = JSON.parse(fs.readFileSync(sessionJsonPath, 'utf8'));
  const v = validateSession(session);
  assert.equal(v.valid, true, `session.json invalid: ${v.errors.join('; ')}`);
  assert.equal(session.slug, result.slug);

  // state.json exists with version 2, currentSession, migratedFrom
  const stateJsonPath = path.join(tmp, '.mockup-gallery/state.json');
  assert.ok(fs.existsSync(stateJsonPath));
  const state = JSON.parse(fs.readFileSync(stateJsonPath, 'utf8'));
  assert.equal(state.version, 2);
  assert.equal(state.currentSession, result.slug);
  assert.equal(state.migratedFrom, 'flat');
  assert.ok(typeof state.migratedAt === 'string');
});

test('migration: HTML files moved under mockups/sessions/<slug>/ with same filenames', () => {
  const tmp = copyFixtureToTmp('html');
  const originalHtml = fs.readdirSync(path.join(fixtureRoot, 'mockups'))
    .filter((f) => f.endsWith('.html'))
    .sort();
  assert.ok(originalHtml.length > 0, 'fixture must have flat html to migrate');

  const result = migrateFlatToSessions({ projectRoot: tmp });
  const sessionDir = path.join(tmp, 'mockups/sessions', result.slug);
  const migratedHtml = fs.readdirSync(sessionDir)
    .filter((f) => f.endsWith('.html'))
    .sort();
  assert.deepEqual(migratedHtml, originalHtml);

  // Originals removed from flat location
  const flatFiles = fs.readdirSync(path.join(tmp, 'mockups')).filter((f) => f.endsWith('.html'));
  assert.deepEqual(flatFiles, [], 'flat mockups/*.html should be gone after migration');

  // Archive directory moved
  const archivedHtml = fs.readdirSync(path.join(sessionDir, 'archive'))
    .filter((f) => f.endsWith('.html'))
    .sort();
  const originalArchive = fs.readdirSync(path.join(fixtureRoot, 'mockups/archive'))
    .filter((f) => f.endsWith('.html'))
    .sort();
  assert.deepEqual(archivedHtml, originalArchive);
  assert.equal(fs.existsSync(path.join(tmp, 'mockups/archive')), false,
    'old mockups/archive should be gone');
});

test('migration: selections.json / last-change.json / selected.json are byte-identical', () => {
  const tmp = copyFixtureToTmp('bytes');
  const result = migrateFlatToSessions({ projectRoot: tmp });

  const flatLoc = path.join(tmp, '.mockup-gallery/selections.json');
  assert.equal(fs.existsSync(flatLoc), false, 'flat selections.json should be gone');

  for (const name of ['selections.json', 'last-change.json', 'selected.json']) {
    const originalBuf = fs.readFileSync(path.join(fixtureRoot, '.mockup-gallery', name));
    const migratedPath = path.join(tmp, '.mockup-gallery/sessions', result.slug, name);
    assert.ok(fs.existsSync(migratedPath), `${name} should exist at new location`);
    const migratedBuf = fs.readFileSync(migratedPath);
    assert.equal(
      Buffer.compare(migratedBuf, originalBuf),
      0,
      `${name} must be byte-identical to the original flat file`,
    );
  }
});

test('migration: idempotency — second call returns already-migrated', () => {
  const tmp = copyFixtureToTmp('idem');
  const first = migrateFlatToSessions({ projectRoot: tmp });
  assert.equal(first.migrated, true);

  const second = migrateFlatToSessions({ projectRoot: tmp });
  assert.equal(second.migrated, false);
  assert.equal(second.reason, 'already-migrated');
});

test('migration: empty project returns no-mockups-found', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-empty-'));
  tmpDirs.push(tmp);
  // No mockups/ at all
  const result = migrateFlatToSessions({ projectRoot: tmp });
  assert.equal(result.migrated, false);
  assert.equal(result.reason, 'no-mockups-found');
});

test('migration: throws when projectRoot missing', () => {
  assert.throws(() => migrateFlatToSessions({ projectRoot: '/definitely/does/not/exist/mg-abc' }));
  assert.throws(() => migrateFlatToSessions({}));
});
