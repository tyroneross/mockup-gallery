// Focused coverage for scratch-first ordering and share-to-LLM payloads.
//
// Run: node --test test/share-flow.test.mjs

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const fixtureRoot = join(here, 'fixtures/multi-session');
const serverEntry = join(repoRoot, 'server/gallery-server.mjs');
const sharedHook = join(repoRoot, 'hooks/check-shared-feedback.mjs');

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
  state.tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-share-'));
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
  return { status: r.status, headers: r.headers, body: await r.json() };
}

async function post(p, body = {}) {
  const r = await fetch(state.baseUrl + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let json;
  try { json = await r.json(); } catch { json = null; }
  return { status: r.status, body: json };
}

test('GET /mockups prioritizes scratch files before newer hi-fi files', async () => {
  const sessionDir = join(state.tmp, 'mockups/sessions/2026-04-01-dashboard');
  fs.writeFileSync(join(sessionDir, '00-scratch-dashboard.html'), '<!doctype html><title>scratch</title>');
  await new Promise((r) => setTimeout(r, 20));
  fs.writeFileSync(join(sessionDir, 'zz-high-fidelity.html'), '<!doctype html><title>hi-fi</title>');

  const { status, body } = await get('/mockups');
  assert.equal(status, 200);
  assert.equal(body[0].file, '00-scratch-dashboard.html');
});

test('share-with-claude reads current session data and hook surfaces candidate arrays', async () => {
  await post('/save', {
    exported: '2026-04-25T00:00:00.000Z',
    total: 2,
    rated: 1,
    selections: [
      { file: 'dash-v1.html', name: 'dash v1', rating: 'yay', note: 'use the tighter header', components: [] },
      { file: 'dash-v2.html', name: 'dash v2', rating: 'unrated', note: null, components: [] },
    ],
  });

  await post('/selected', {
    pages: {
      '/dashboard': [
        { source: 'dash-v1.html', note: null, changeNote: 'Use the scratch layout first.', status: null },
        { source: 'dash-v2.html', note: 'backup candidate', changeNote: 'Compare only after v1.', status: 'done' },
      ],
    },
    components: {},
    picks: [{ source: '00-scratch-dashboard.html', pickedAt: '2026-04-25', note: 'unassigned scratch pass' }],
    saved: [],
  });

  const shared = await post('/share-with-claude');
  assert.equal(shared.status, 200);
  assert.equal(shared.body.ok, true);

  const pendingPath = join(state.tmp, '.mockup-gallery/pending-review.json');
  const pending = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));
  assert.equal(pending.layout, 'sessions');
  assert.equal(pending.session.slug, '2026-04-01-dashboard');
  assert.equal(pending.selections['/dashboard'].length, 2);
  assert.equal(pending.picks[0].mockup, '00-scratch-dashboard.html');
  assert.equal(pending.ratings[0].file, 'dash-v1.html');

  const hook = spawnSync(process.execPath, [sharedHook], {
    cwd: state.tmp,
    encoding: 'utf8',
  });
  assert.equal(hook.status, 0);
  assert.match(hook.stdout, /Session: 2026-04-01-dashboard/);
  assert.match(hook.stdout, /\/dashboard \(1\/2\).*dash-v1\.html/);
  assert.match(hook.stdout, /Change: Use the scratch layout first\./);
  assert.match(hook.stdout, /\/dashboard \(2\/2\).*dash-v2\.html/);
  assert.match(hook.stdout, /Unassigned picks:/);
  assert.equal(fs.existsSync(pendingPath), false, 'shared feedback should be one-shot');
});
