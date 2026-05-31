// Grader: Per-selection implementation handoff artifacts.
//
// Verifies that:
//   - routeToSlug normalizes routes
//   - emitHandoffsForSelection writes per-route .md files with frontmatter
//   - existing files are preserved by default (idempotency)
//   - regenerate:true overwrites
//   - POST /selected triggers emission and the artifact lands in the right
//     directory for legacy and sessions layouts
//
// Run: node --test test/handoff.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  routeToSlug,
  emitHandoffsForSelection,
  handoffDir,
  handoffPath,
  HANDOFF_FORMAT_VERSION,
} from '../src/lib/handoff.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

function mkProject() {
  const root = mkdtempSync(join(tmpdir(), 'mgallery-handoff-'));
  const mockupDir = join(root, 'mockups');
  const storageDir = join(root, '.mockup-gallery');
  mkdirSync(mockupDir, { recursive: true });
  mkdirSync(storageDir, { recursive: true });
  writeFileSync(join(mockupDir, 'home.html'), '<html><body>home</body></html>');
  writeFileSync(join(mockupDir, 'search.html'), '<html><body>search</body></html>');
  return { root, mockupDir, storageDir };
}

// ── routeToSlug ────────────────────────────────────────────────────────────

test('routeToSlug: standard cases', () => {
  const cases = [
    ['/', 'root'],
    ['/search', 'search'],
    ['/admin/users', 'admin-users'],
    ['/users/[id]/edit', 'users-id-edit'],
    ['/Reports/Daily', 'reports-daily'],
    ['', null],
    ['/', 'root'],
    ['///', 'root'],
    [null, null],
    [42, null],
  ];
  for (const [input, expected] of cases) {
    assert.equal(routeToSlug(input), expected,
      `routeToSlug(${JSON.stringify(input)}) expected ${JSON.stringify(expected)}`);
  }
});

// ── emitHandoffsForSelection — library ─────────────────────────────────────

test('emitHandoffsForSelection: writes one .md per page route with frontmatter', () => {
  const { storageDir, root } = mkProject();
  try {
    const selected = {
      pages: {
        '/': [{ source: 'home.html', selectedAt: '2026-05-30', status: 'pending' }],
        '/search': [{ source: 'search.html', selectedAt: '2026-05-30', status: 'pending', changeNote: 'Tighten input' }],
      },
    };
    const result = emitHandoffsForSelection(storageDir, selected);
    assert.equal(result.errors.length, 0, `errors: ${JSON.stringify(result.errors)}`);
    assert.equal(result.written.length, 2);

    const rootPath = join(storageDir, 'handoff', 'root.md');
    const searchPath = join(storageDir, 'handoff', 'search.md');
    assert.ok(existsSync(rootPath));
    assert.ok(existsSync(searchPath));

    const rootText = readFileSync(rootPath, 'utf8');
    assert.match(rootText, /^---\n/);
    assert.match(rootText, /schema: mockup-gallery-handoff/);
    assert.match(rootText, new RegExp(`schemaVersion: ${HANDOFF_FORMAT_VERSION}`));
    assert.match(rootText, /route: "\/"/);
    assert.match(rootText, /source: "home\.html"/);
    assert.match(rootText, /filled: false/);
    // Body sections
    for (const sec of ['## Source', '## Components', '## Data Elements',
                       '## Connectors / APIs', '## States', '## Open Questions']) {
      assert.ok(rootText.includes(sec), `missing section ${sec}`);
    }

    const searchText = readFileSync(searchPath, 'utf8');
    assert.match(searchText, /Tighten input/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('emitHandoffsForSelection: preserves existing files by default (idempotent)', () => {
  const { storageDir, root } = mkProject();
  try {
    const selected = {
      pages: { '/search': [{ source: 'search.html', selectedAt: '2026-05-30' }] },
    };
    emitHandoffsForSelection(storageDir, selected);
    const p = join(storageDir, 'handoff', 'search.md');
    // Simulate agent-filled content
    writeFileSync(p, '---\nfilled: true\n---\n# AGENT-EDITED\n', 'utf8');

    const result = emitHandoffsForSelection(storageDir, selected);
    assert.equal(result.written.length, 0);
    assert.equal(result.skipped.length, 1);
    assert.match(result.skipped[0].reason, /exists/);
    assert.equal(readFileSync(p, 'utf8'), '---\nfilled: true\n---\n# AGENT-EDITED\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('emitHandoffsForSelection: regenerate:true overwrites', () => {
  const { storageDir, root } = mkProject();
  try {
    const selected = {
      pages: { '/search': [{ source: 'search.html', selectedAt: '2026-05-30' }] },
    };
    emitHandoffsForSelection(storageDir, selected);
    const p = join(storageDir, 'handoff', 'search.md');
    writeFileSync(p, 'OLD CONTENT', 'utf8');
    const result = emitHandoffsForSelection(storageDir, selected, { regenerate: true });
    assert.equal(result.written.length, 1);
    assert.match(readFileSync(p, 'utf8'), /schema: mockup-gallery-handoff/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('emitHandoffsForSelection: scopes to session when sessionSlug provided', () => {
  const { storageDir, root } = mkProject();
  try {
    const selected = {
      pages: { '/dashboard': [{ source: 'home.html', selectedAt: '2026-05-30' }] },
    };
    const result = emitHandoffsForSelection(storageDir, selected, { sessionSlug: '2026-05-30-test' });
    assert.equal(result.errors.length, 0);
    const expected = join(storageDir, 'sessions', '2026-05-30-test', 'handoff', 'dashboard.md');
    assert.ok(existsSync(expected), `expected ${expected}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('emitHandoffsForSelection: picks primary entry when multiple candidates exist', () => {
  const { storageDir, root } = mkProject();
  try {
    const selected = {
      pages: {
        '/search': [
          { source: 'search-a.html', selectedAt: '2026-05-30', note: 'variant A' },
          { source: 'search-b.html', selectedAt: '2026-05-30', note: 'variant B', primary: true },
        ],
      },
    };
    emitHandoffsForSelection(storageDir, selected);
    const text = readFileSync(join(storageDir, 'handoff', 'search.md'), 'utf8');
    assert.match(text, /source: "search-b\.html"/);
    assert.match(text, /variant B/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('emitHandoffsForSelection: tolerates bare-object legacy entries', () => {
  const { storageDir, root } = mkProject();
  try {
    const selected = {
      pages: { '/search': { source: 'search.html', selectedAt: '2026-05-30' } },
    };
    const result = emitHandoffsForSelection(storageDir, selected);
    assert.equal(result.written.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('handoffPath: returns null for invalid route', () => {
  const { storageDir, root } = mkProject();
  try {
    assert.equal(handoffPath(storageDir, ''), null);
    assert.equal(handoffPath(storageDir, '/').endsWith('handoff/root.md'), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── Server endpoint ────────────────────────────────────────────────────────

function startServer(project) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [join(repoRoot, 'server/gallery-server.mjs'), '--project', project, '--no-open'],
      { env: { ...process.env, NODE_ENV: 'test', MOCKUP_GALLERY_NO_OPEN: '1' } },
    );
    let buf = '';
    let timer = setTimeout(() => reject(new Error('server start timeout')), 5000);
    child.stdout.on('data', (chunk) => {
      buf += chunk.toString();
      const m = buf.match(/http:\/\/localhost:(\d+)/);
      if (m) {
        clearTimeout(timer);
        resolve({ child, port: parseInt(m[1], 10) });
      }
    });
    child.stderr.on('data', (chunk) => { buf += chunk.toString(); });
    child.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        clearTimeout(timer);
        reject(new Error(`server exited ${code}: ${buf}`));
      }
    });
  });
}

async function stopServer(child) {
  return new Promise((resolve) => {
    child.once('exit', () => resolve());
    child.kill('SIGTERM');
  });
}

test('POST /selected (legacy layout) writes .mockup-gallery/handoff/<slug>.md', async () => {
  const { root, storageDir } = mkProject();
  let srv;
  try {
    srv = await startServer(root);
    const body = {
      pages: {
        '/': [{ source: 'home.html', selectedAt: '2026-05-30' }],
        '/search': [{ source: 'search.html', selectedAt: '2026-05-30' }],
      },
    };
    const r = await fetch(`http://localhost:${srv.port}/selected`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.ok, true);
    assert.ok(j.handoff);
    assert.equal(j.handoff.written.length, 2);
    assert.ok(existsSync(join(storageDir, 'handoff', 'root.md')));
    assert.ok(existsSync(join(storageDir, 'handoff', 'search.md')));

    // Re-POST → idempotent (no overwrite)
    const r2 = await fetch(`http://localhost:${srv.port}/selected`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j2 = await r2.json();
    assert.equal(j2.handoff.written.length, 0);
    assert.equal(j2.handoff.skipped.length, 2);

    // regenerateHandoffs:true → overwrite
    const r3 = await fetch(`http://localhost:${srv.port}/selected`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, regenerateHandoffs: true }),
    });
    const j3 = await r3.json();
    assert.equal(j3.handoff.written.length, 2);
  } finally {
    if (srv) await stopServer(srv.child);
    rmSync(root, { recursive: true, force: true });
  }
});
