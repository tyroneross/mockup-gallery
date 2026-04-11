// Grader 5: Backward compatibility
//
// Starts the gallery-server against a COPY of the flat-unmigrated fixture
// WITHOUT running migration first. Verifies the server still serves the flat
// layout, round-trips selections, and does not touch the session paths.
//
// Run: node --test test/legacy-compat.test.mjs

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
const fixtureRoot = join(here, 'fixtures/flat-unmigrated');
const serverEntry = join(repoRoot, 'server/gallery-server.mjs');

const state = { tmp: null, child: null, port: 0, baseUrl: '' };

function pickPort() {
  return 9000 + Math.floor(Math.random() * 1000);
}

async function waitForReady(child, port, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let sawBanner = false;
  child.stdout.on('data', (b) => { if (b.toString().includes('Mockup Gallery')) sawBanner = true; });
  child.stderr.on('data', (b) => process.stderr.write(`[server-stderr] ${b}`));
  while (Date.now() < deadline) {
    if (sawBanner) {
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
  state.tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-legacy-'));
  fs.cpSync(fixtureRoot, state.tmp, { recursive: true });
  state.port = pickPort();
  state.baseUrl = `http://127.0.0.1:${state.port}`;

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

async function get(p) {
  const r = await fetch(state.baseUrl + p);
  const headers = r.headers;
  let body;
  try { body = await r.json(); } catch { body = null; }
  return { status: r.status, headers, body };
}

async function post(p, body) {
  const r = await fetch(state.baseUrl + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let json;
  try { json = await r.json(); } catch { json = null; }
  return { status: r.status, body: json };
}

test('server starts successfully against flat-unmigrated fixture', async () => {
  // If the before() hook succeeded, the server is up. Do one sanity call.
  const info = await get('/project-info');
  assert.equal(info.status, 200);
  assert.ok(info.body.projectName);
});

test('GET /mockups returns 200 with the flat file list (4 HTML files)', async () => {
  const { status, body, headers } = await get('/mockups');
  assert.equal(status, 200);
  assert.equal(headers.get('x-mockup-gallery-layout'), 'flat',
    'X-Mockup-Gallery-Layout header should be "flat" in legacy mode');
  assert.ok(Array.isArray(body));
  assert.equal(body.length, 4, `expected 4 html files in flat fixture, got ${body.length}`);

  const files = body.map((f) => f.file).sort();
  assert.deepEqual(files, [
    'fixture-archived.html',
    'fixture-page-1.html',
    'fixture-page-2.html',
    'fixture-page-3.html',
  ]);
});

test('GET /sessions reports flat layout and needsMigration=true', async () => {
  const { status, body } = await get('/sessions');
  assert.equal(status, 200);
  assert.equal(body.layout, 'flat');
  assert.equal(body.needsMigration, true);
  // listSessions returns [] when there is no sessions/ dir
  assert.ok(Array.isArray(body.sessions));
  assert.equal(body.sessions.length, 0);
});

test('POST /save + GET /selections round-trip in flat mode', async () => {
  const payload = {
    exported: '2026-04-11T00:00:00.000Z',
    total: 1,
    rated: 1,
    selections: [
      { file: 'fixture-page-1.html', name: 'fixture page 1', rating: 'yay', note: 'from-test' },
    ],
  };
  const save = await post('/save', payload);
  assert.equal(save.status, 200);
  assert.equal(save.body.ok, true);

  const read = await get('/selections');
  assert.equal(read.status, 200);
  assert.equal(read.body.total, 1);
  assert.equal(read.body.rated, 1);
  assert.equal(read.body.selections[0].file, 'fixture-page-1.html');
  assert.equal(read.body.selections[0].rating, 'yay');
  assert.equal(read.body.selections[0].note, 'from-test');
});

test('no mockups/sessions/ directory was created', () => {
  const sessionsDir = path.join(state.tmp, 'mockups/sessions');
  assert.equal(fs.existsSync(sessionsDir), false,
    'legacy flat operation must not create mockups/sessions/');
});

test('no .mockup-gallery/state.json was created', () => {
  const stateJson = path.join(state.tmp, '.mockup-gallery/state.json');
  assert.equal(fs.existsSync(stateJson), false,
    'legacy flat operation must not create .mockup-gallery/state.json');
});
