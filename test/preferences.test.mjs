// Grader: Workflow preferences (wireframe-first toggle)
//
// Verifies that preferences round-trip through session-store, default to
// wireframe-first ON, persist into state.json with schema validation, and
// that the server's GET/POST /preferences endpoints reflect the same state.
//
// Run: node --test test/preferences.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import {
  readPreferences,
  writePreferences,
  defaultPreferences,
  readState,
} from '../src/lib/session-store.mjs';
import { validateState } from '../src/lib/validate.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

function mkProject() {
  const root = mkdtempSync(join(tmpdir(), 'mgallery-prefs-'));
  const mockupDir = join(root, 'mockups');
  const storageDir = join(root, '.mockup-gallery');
  mkdirSync(mockupDir, { recursive: true });
  mkdirSync(storageDir, { recursive: true });
  // A single HTML mockup so the server doesn't refuse to start.
  writeFileSync(join(mockupDir, 'home.html'), '<html><body>home</body></html>');
  return { root, mockupDir, storageDir };
}

// ── Library-level ──────────────────────────────────────────────────────────

test('defaultPreferences: wireframeFirst defaults to true', () => {
  const d = defaultPreferences();
  assert.equal(d.wireframeFirst, true);
});

test('readPreferences: returns defaults when state.json is missing', () => {
  const { storageDir, root } = mkProject();
  try {
    const prefs = readPreferences(storageDir);
    assert.deepEqual(prefs, { wireframeFirst: true });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('writePreferences: persists wireframeFirst=false and round-trips', () => {
  const { storageDir, root } = mkProject();
  try {
    const updated = writePreferences(storageDir, { wireframeFirst: false });
    assert.equal(updated.wireframeFirst, false);
    assert.equal(readPreferences(storageDir).wireframeFirst, false);

    // State on disk must still pass schema validation.
    const state = readState(storageDir);
    const result = validateState(state);
    assert.equal(result.valid, true, `state failed schema: ${result.errors.join('; ')}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('writePreferences: rejects unknown preference keys', () => {
  const { storageDir, root } = mkProject();
  try {
    assert.throws(
      () => writePreferences(storageDir, { wireframeFirst: true, bogus: 1 }),
      /Unknown preference: bogus/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('writePreferences: re-toggle restores wireframeFirst=true', () => {
  const { storageDir, root } = mkProject();
  try {
    writePreferences(storageDir, { wireframeFirst: false });
    const restored = writePreferences(storageDir, { wireframeFirst: true });
    assert.equal(restored.wireframeFirst, true);
    assert.equal(readPreferences(storageDir).wireframeFirst, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── Server endpoints ───────────────────────────────────────────────────────

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

test('GET /preferences returns wireframeFirst=true by default', async () => {
  const { root } = mkProject();
  let srv;
  try {
    srv = await startServer(root);
    const resp = await fetch(`http://localhost:${srv.port}/preferences`);
    assert.equal(resp.status, 200);
    const body = await resp.json();
    assert.equal(body.wireframeFirst, true);
  } finally {
    if (srv) await stopServer(srv.child);
    rmSync(root, { recursive: true, force: true });
  }
});

test('POST /preferences persists wireframeFirst=false and GET reflects it', async () => {
  const { root, storageDir } = mkProject();
  let srv;
  try {
    srv = await startServer(root);
    const postResp = await fetch(`http://localhost:${srv.port}/preferences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wireframeFirst: false }),
    });
    assert.equal(postResp.status, 200);
    const postBody = await postResp.json();
    assert.equal(postBody.ok, true);
    assert.equal(postBody.preferences.wireframeFirst, false);

    const getResp = await fetch(`http://localhost:${srv.port}/preferences`);
    const getBody = await getResp.json();
    assert.equal(getBody.wireframeFirst, false);

    // Persisted to disk
    assert.ok(existsSync(join(storageDir, 'state.json')));
    const state = JSON.parse(readFileSync(join(storageDir, 'state.json'), 'utf8'));
    assert.equal(state.preferences.wireframeFirst, false);
  } finally {
    if (srv) await stopServer(srv.child);
    rmSync(root, { recursive: true, force: true });
  }
});

test('POST /preferences rejects unknown keys with 400', async () => {
  const { root } = mkProject();
  let srv;
  try {
    srv = await startServer(root);
    const resp = await fetch(`http://localhost:${srv.port}/preferences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bogus: true }),
    });
    assert.equal(resp.status, 400);
    const body = await resp.json();
    assert.match(body.error, /Unknown preference/);
  } finally {
    if (srv) await stopServer(srv.child);
    rmSync(root, { recursive: true, force: true });
  }
});

test('POST /preferences rejects non-object body with 400', async () => {
  const { root } = mkProject();
  let srv;
  try {
    srv = await startServer(root);
    const resp = await fetch(`http://localhost:${srv.port}/preferences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([1, 2, 3]),
    });
    assert.equal(resp.status, 400);
  } finally {
    if (srv) await stopServer(srv.child);
    rmSync(root, { recursive: true, force: true });
  }
});
