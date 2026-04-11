// Grader 3: Server routes — session endpoints
//
// Starts the gallery-server.mjs in a subprocess against a copy of the
// multi-session fixture, then drives it via HTTP.
//
// Run: node --test test/server-sessions.test.mjs

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const fixtureRoot = join(here, 'fixtures/multi-session');
const serverEntry = join(repoRoot, 'server/gallery-server.mjs');

const state = {
  tmp: null,
  child: null,
  port: 0,
  baseUrl: '',
};

function pickPort() {
  return 9000 + Math.floor(Math.random() * 1000);
}

async function waitForReady(child, port, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let sawBanner = false;
  child.stdout.on('data', (b) => {
    if (b.toString().includes('Mockup Gallery')) sawBanner = true;
  });
  child.stderr.on('data', (b) => {
    // surface server errors for easier debugging
    process.stderr.write(`[server-stderr] ${b}`);
  });
  while (Date.now() < deadline) {
    if (sawBanner) {
      // give the listen() callback a beat to finish binding
      try {
        const r = await fetch(`http://127.0.0.1:${port}/project-info`);
        if (r.ok) return;
      } catch {}
    }
    await new Promise((r) => setTimeout(r, 60));
  }
  throw new Error(`server did not become ready on port ${port} within ${timeoutMs}ms`);
}

before(async () => {
  state.tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-server-'));
  fs.cpSync(fixtureRoot, state.tmp, { recursive: true });
  state.port = pickPort();
  state.baseUrl = `http://127.0.0.1:${state.port}`;

  // Prepend a dummy PATH so the server's execSync('open ...') no-ops quietly
  // (prevents opening a real browser tab for every test run).
  const shimDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-pathshim-'));
  fs.writeFileSync(path.join(shimDir, 'open'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  fs.writeFileSync(path.join(shimDir, 'xdg-open'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });

  state.child = spawn(
    process.execPath,
    [serverEntry, '--project', state.tmp, '--port', String(state.port)],
    {
      cwd: state.tmp,
      env: { ...process.env, PATH: `${shimDir}:${process.env.PATH || ''}` },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  await waitForReady(state.child, state.port);
});

after(async () => {
  if (state.child) {
    state.child.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 100));
    if (!state.child.killed) state.child.kill('SIGKILL');
  }
  if (state.tmp) {
    try { fs.rmSync(state.tmp, { recursive: true, force: true }); } catch {}
  }
});

async function get(path) {
  const r = await fetch(state.baseUrl + path);
  return { status: r.status, headers: r.headers, body: await r.json() };
}
async function post(path, body) {
  const r = await fetch(state.baseUrl + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, headers: r.headers, body: await r.json() };
}

test('GET /sessions returns sessions list with currentSession and layout', async () => {
  const { status, body } = await get('/sessions');
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.sessions));
  assert.equal(body.sessions.length, 2, `expected 2 sessions in fixture, got ${body.sessions.length}`);
  assert.equal(body.layout, 'sessions');
  assert.equal(body.needsMigration, false);
  assert.equal(body.currentSession, '2026-04-01-dashboard');
});

test('GET /session/<slug> returns session metadata', async () => {
  const { status, body } = await get('/session/2026-04-01-dashboard');
  assert.equal(status, 200);
  assert.equal(body.slug, '2026-04-01-dashboard');
  assert.equal(body.name, 'Dashboard layout v1 vs v2');
  assert.equal(body.status, 'active');
});

test('POST /session/switch updates currentSession', async () => {
  const { status, body } = await post('/session/switch', { slug: '2026-03-15-icons' });
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.currentSession, '2026-03-15-icons');

  // Confirm via GET /sessions
  const after = await get('/sessions');
  assert.equal(after.body.currentSession, '2026-03-15-icons');

  // Put it back for subsequent tests' predictability
  await post('/session/switch', { slug: '2026-04-01-dashboard' });
});

test('POST /session/create with valid payload creates a session', async () => {
  const { status, body } = await post('/session/create', {
    name: 'Test session',
    goal: 'Just testing',
    tags: ['test'],
  });
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.ok(body.session);
  assert.ok(body.session.slug && body.session.slug.length > 0);
  assert.equal(body.session.name, 'Test session');

  // Session now exists on disk
  const sessionJson = path.join(state.tmp, 'mockups/sessions', body.session.slug, 'session.json');
  assert.ok(fs.existsSync(sessionJson));

  // GET /sessions now has 3 entries; current is the new one (createSession side effect)
  const listing = await get('/sessions');
  assert.equal(listing.body.sessions.length, 3);
  assert.equal(listing.body.currentSession, body.session.slug);

  // Restore previous current for later tests
  await post('/session/switch', { slug: '2026-04-01-dashboard' });
});

test('POST /session/create with invalid slug returns 400', async () => {
  const { status, body } = await post('/session/create', {
    name: 'Bad',
    slug: 'BAD SLUG!',
  });
  assert.equal(status, 400);
  assert.ok(body.error);
});

test('GET /mockups?session=2026-03-15-icons returns only icon files', async () => {
  const { status, body, headers } = await get('/mockups?session=2026-03-15-icons');
  assert.equal(status, 200);
  assert.equal(headers.get('x-mockup-gallery-layout'), 'sessions',
    'X-Mockup-Gallery-Layout header should be sessions');
  assert.ok(Array.isArray(body));
  const files = body.map((f) => f.file).sort();
  assert.deepEqual(files, ['icon-a.html', 'icon-b.html', 'icon-c.html']);
});

test('GET /mockups (no query) returns files from currentSession', async () => {
  const { body } = await get('/mockups');
  const files = body.map((f) => f.file).sort();
  assert.deepEqual(files, ['dash-v1.html', 'dash-v2.html']);
});
