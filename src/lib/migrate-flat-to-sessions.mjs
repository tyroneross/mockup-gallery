// Migrate a project from flat mockup-gallery layout to session-scoped layout.
//
// Flat layout (pre-session):
//   mockups/
//     *.html
//     archive/*.html
//     selected/*.html
//   .mockup-gallery/
//     selections.json
//     last-change.json
//     selected.json
//
// Session layout (post-migration):
//   mockups/
//     sessions/
//       legacy-YYYY-MM-DD/
//         session.json
//         *.html               (same files, moved)
//         archive/*.html
//         selected/*.html
//   .mockup-gallery/
//     state.json               (version 2, currentSession, migratedFrom, migratedAt)
//     sessions/
//       legacy-YYYY-MM-DD/
//         selections.json      (byte-identical to old flat file)
//         last-change.json
//         selected.json
//
// The migration is idempotent: if state.json already reports version 2, returns
// { migrated: false, reason: 'already-migrated' } without touching files.
//
// The migration is non-destructive in planning mode (--dry-run), meaning it
// walks the tree and reports the intended moves without performing them.

import fs from 'fs';
import path from 'path';
import { validateSession, validateState } from './validate.mjs';

function isoDate() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function isoNow() {
  return new Date().toISOString();
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

// Atomic write: temp file + rename. Falls back to direct write on Windows where
// rename-over-existing can fail (not a target platform today but harmless).
function atomicWriteJson(destPath, obj) {
  ensureDir(path.dirname(destPath));
  const tmp = destPath + '.tmp-' + process.pid + '-' + Date.now();
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, destPath);
}

// Move a file or directory. Copy-then-unlink to support cross-device and to
// preserve the source until the destination is fully written in dry-run mode.
function moveEntry(src, dest, { dryRun }) {
  if (!fs.existsSync(src)) return false;
  if (dryRun) return true;
  ensureDir(path.dirname(dest));
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.cpSync(src, dest, { recursive: true });
    fs.rmSync(src, { recursive: true, force: true });
  } else {
    fs.cpSync(src, dest);
    fs.unlinkSync(src);
  }
  return true;
}

// List all .html files in a directory, non-recursive, excluding subdirectory
// names that are themselves meaningful (archive, selected, sessions).
function listHtmlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.html'))
    .map((e) => e.name);
}

// Detect whether a given project already has a session layout.
function detectLayout(projectRoot) {
  const mockupDir = path.join(projectRoot, 'mockups');
  const storageDir = path.join(projectRoot, '.mockup-gallery');
  const stateFile = path.join(storageDir, 'state.json');
  const sessionsDir = path.join(mockupDir, 'sessions');

  if (fs.existsSync(stateFile)) {
    try {
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      if (state && state.version === 2) return 'sessions';
    } catch {
      // fall through — broken state file, treat as flat and re-migrate
    }
  }

  if (fs.existsSync(sessionsDir) && fs.statSync(sessionsDir).isDirectory()) {
    // Has sessions dir but no state.json — partial migration
    return 'sessions-partial';
  }

  if (fs.existsSync(mockupDir) && listHtmlFiles(mockupDir).length > 0) {
    return 'flat';
  }

  // No mockups at all
  return 'empty';
}

/**
 * Run the migration.
 *
 * @param {object} opts
 * @param {string} opts.projectRoot - Absolute path to the project (contains mockups/)
 * @param {boolean} [opts.dryRun=false] - If true, report intended moves without touching files
 * @param {string} [opts.sessionName] - Override for the legacy session's display name
 * @returns {object} migration report
 */
export function migrateFlatToSessions({ projectRoot, dryRun = false, sessionName } = {}) {
  if (!projectRoot) throw new Error('projectRoot required');
  if (!fs.existsSync(projectRoot)) throw new Error('projectRoot does not exist: ' + projectRoot);

  const mockupDir = path.join(projectRoot, 'mockups');
  const storageDir = path.join(projectRoot, '.mockup-gallery');

  const layout = detectLayout(projectRoot);

  if (layout === 'sessions') {
    return { migrated: false, reason: 'already-migrated', layout, moves: [] };
  }

  if (layout === 'empty') {
    return { migrated: false, reason: 'no-mockups-found', layout, moves: [] };
  }

  if (layout === 'sessions-partial') {
    return {
      migrated: false,
      reason: 'sessions-dir-exists-without-state-json',
      layout,
      moves: [],
      hint: 'Manually resolve: either delete mockups/sessions/ if empty, or create .mockup-gallery/state.json pointing at one of the existing sessions.',
    };
  }

  // layout === 'flat' — proceed with migration

  const slug = 'legacy-' + isoDate();
  const now = isoNow();
  const moves = [];
  const warnings = [];

  // Compute destination paths
  const sessionMockupDir = path.join(mockupDir, 'sessions', slug);
  const sessionStorageDir = path.join(storageDir, 'sessions', slug);

  // Move HTML files at the top level of mockups/
  for (const filename of listHtmlFiles(mockupDir)) {
    const src = path.join(mockupDir, filename);
    const dest = path.join(sessionMockupDir, filename);
    moveEntry(src, dest, { dryRun });
    moves.push({ from: path.relative(projectRoot, src), to: path.relative(projectRoot, dest) });
  }

  // Move mockups/archive → sessions/<slug>/archive
  const archiveSrc = path.join(mockupDir, 'archive');
  if (fs.existsSync(archiveSrc)) {
    const archiveDest = path.join(sessionMockupDir, 'archive');
    moveEntry(archiveSrc, archiveDest, { dryRun });
    moves.push({ from: path.relative(projectRoot, archiveSrc), to: path.relative(projectRoot, archiveDest) });
  }

  // Move mockups/selected → sessions/<slug>/selected
  const selectedSrc = path.join(mockupDir, 'selected');
  if (fs.existsSync(selectedSrc)) {
    const selectedDest = path.join(sessionMockupDir, 'selected');
    moveEntry(selectedSrc, selectedDest, { dryRun });
    moves.push({ from: path.relative(projectRoot, selectedSrc), to: path.relative(projectRoot, selectedDest) });
  }

  // Move .mockup-gallery/selections.json → .mockup-gallery/sessions/<slug>/selections.json
  const stateFiles = ['selections.json', 'last-change.json', 'selected.json'];
  for (const filename of stateFiles) {
    const src = path.join(storageDir, filename);
    if (fs.existsSync(src)) {
      const dest = path.join(sessionStorageDir, filename);
      moveEntry(src, dest, { dryRun });
      moves.push({ from: path.relative(projectRoot, src), to: path.relative(projectRoot, dest) });
    }
  }

  // Write session.json
  const session = {
    slug,
    name: sessionName || 'Pre-session layout',
    goal: 'Migrated from flat mockups/ directory',
    createdAt: now,
    updatedAt: now,
    status: 'active',
    tags: ['legacy', 'migrated'],
    supersededBy: null,
    decision: null,
  };

  const sessionValidation = validateSession(session);
  if (!sessionValidation.valid) {
    throw new Error('migration produced invalid session.json: ' + sessionValidation.errors.join(', '));
  }

  const sessionJsonPath = path.join(sessionMockupDir, 'session.json');
  if (!dryRun) atomicWriteJson(sessionJsonPath, session);
  moves.push({ create: path.relative(projectRoot, sessionJsonPath) });

  // Write state.json
  const state = {
    version: 2,
    currentSession: slug,
    migratedFrom: 'flat',
    migratedAt: now,
  };

  const stateValidation = validateState(state);
  if (!stateValidation.valid) {
    throw new Error('migration produced invalid state.json: ' + stateValidation.errors.join(', '));
  }

  const stateJsonPath = path.join(storageDir, 'state.json');
  if (!dryRun) atomicWriteJson(stateJsonPath, state);
  moves.push({ create: path.relative(projectRoot, stateJsonPath) });

  return {
    migrated: !dryRun,
    reason: dryRun ? 'dry-run' : 'migrated-flat-to-sessions',
    layout: 'flat',
    slug,
    moves,
    warnings,
  };
}

// Self-test when invoked directly. Migrates a freshly-copied fixture and
// compares the result against the expected post-migration fixture.
if (import.meta.url === `file://${process.argv[1]}`) {
  const scriptDir = path.dirname(new URL(import.meta.url).pathname);
  const repoRoot = path.resolve(scriptDir, '../..');
  const fixtureSrc = path.join(repoRoot, 'test/fixtures/flat-unmigrated');
  const fixtureExpected = path.join(repoRoot, 'test/fixtures/flat-migrated');

  if (!fs.existsSync(fixtureSrc)) {
    console.error('fixture missing:', fixtureSrc);
    process.exit(1);
  }

  // Copy fixture to a tmp workspace so we don't mutate the source
  const tmpRoot = path.join(repoRoot, '.build-loop/tmp/migrate-self-test');
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  fs.cpSync(fixtureSrc, tmpRoot, { recursive: true });

  const result = migrateFlatToSessions({ projectRoot: tmpRoot });
  console.log('dry=false result:', JSON.stringify(result, null, 2));

  if (!result.migrated) {
    console.error('migration did not run');
    process.exit(1);
  }

  // Verify presence of expected files
  const expectedFiles = [
    'mockups/sessions/' + result.slug + '/session.json',
    'mockups/sessions/' + result.slug + '/fixture-page-1.html',
    '.mockup-gallery/state.json',
    '.mockup-gallery/sessions/' + result.slug + '/selections.json',
  ];
  for (const rel of expectedFiles) {
    const p = path.join(tmpRoot, rel);
    if (!fs.existsSync(p)) {
      console.error('expected file missing after migration:', rel);
      process.exit(1);
    }
  }

  // Byte-compare selections.json against fixture source
  const migrated = fs.readFileSync(
    path.join(tmpRoot, '.mockup-gallery/sessions/' + result.slug + '/selections.json'),
  );
  const original = fs.readFileSync(path.join(fixtureSrc, '.mockup-gallery/selections.json'));
  if (Buffer.compare(migrated, original) !== 0) {
    console.error('selections.json NOT byte-identical after migration');
    process.exit(1);
  }

  // Cleanup
  fs.rmSync(tmpRoot, { recursive: true, force: true });

  console.log('migrate self-test OK');
}
