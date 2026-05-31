// Grader: Google DESIGN.md (alpha) detect + scaffold
//
// Verifies:
//   - splitFrontmatter correctly partitions DESIGN.md content
//   - extractSections returns ## headings in order
//   - detectDesignSystem reports present/absent + section list
//   - scaffoldDesignSystem creates a valid starter and refuses overwrite
//   - server endpoints /design-system and /design-system/scaffold round-trip
//
// Run: node --test test/design-system.test.mjs

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
  detectDesignSystem,
  scaffoldDesignSystem,
  splitFrontmatter,
  extractSections,
  designPath,
  DESIGN_FILENAME,
  SECTION_ORDER,
} from '../src/lib/design-system.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

function mkProject() {
  const root = mkdtempSync(join(tmpdir(), 'mgallery-design-'));
  const mockupDir = join(root, 'mockups');
  const storageDir = join(root, '.mockup-gallery');
  mkdirSync(mockupDir, { recursive: true });
  mkdirSync(storageDir, { recursive: true });
  writeFileSync(join(mockupDir, 'home.html'), '<html><body>home</body></html>');
  return { root, mockupDir, storageDir };
}

// ── splitFrontmatter ───────────────────────────────────────────────────────

test('splitFrontmatter: returns null frontmatter when none present', () => {
  const { frontmatter, body } = splitFrontmatter('# Heading\n\nbody');
  assert.equal(frontmatter, null);
  assert.equal(body, '# Heading\n\nbody');
});

test('splitFrontmatter: extracts YAML between --- delimiters', () => {
  const raw = '---\nname: foo\nversion: alpha\n---\n\n## Overview\nbody';
  const { frontmatter, body } = splitFrontmatter(raw);
  assert.equal(frontmatter, 'name: foo\nversion: alpha');
  assert.match(body, /## Overview/);
});

test('splitFrontmatter: handles missing closing delimiter gracefully', () => {
  const raw = '---\nname: foo\nno closer here';
  const { frontmatter, body } = splitFrontmatter(raw);
  assert.equal(frontmatter, null);
  assert.equal(body, raw);
});

test('splitFrontmatter: handles non-string input', () => {
  const { frontmatter, body } = splitFrontmatter(null);
  assert.equal(frontmatter, null);
  assert.equal(body, '');
});

// ── extractSections ───────────────────────────────────────────────────────

test('extractSections: returns ## headings in source order', () => {
  const body = '## Overview\ntext\n## Colors\nmore\n### Subhead\n## Typography\n';
  assert.deepEqual(extractSections(body), ['Overview', 'Colors', 'Typography']);
});

test('extractSections: ignores h1, h3, and indented hashes', () => {
  const body = '# Title\n## Real\n  ## NotASection\n### Sub\n';
  assert.deepEqual(extractSections(body), ['Real']);
});

// ── detectDesignSystem ────────────────────────────────────────────────────

test('detectDesignSystem: absent file → present:false, sections:[]', () => {
  const { root } = mkProject();
  try {
    const d = detectDesignSystem(root);
    assert.equal(d.present, false);
    assert.equal(d.path, join(root, DESIGN_FILENAME));
    assert.deepEqual(d.sections, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('detectDesignSystem: present file reports frontmatter + sections', () => {
  const { root } = mkProject();
  try {
    writeFileSync(designPath(root),
      '---\nname: test\n---\n\n## Overview\n\n## Colors\n\n## Typography\n');
    const d = detectDesignSystem(root);
    assert.equal(d.present, true);
    assert.equal(d.hasFrontmatter, true);
    assert.deepEqual(d.sections, ['Overview', 'Colors', 'Typography']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── scaffoldDesignSystem ───────────────────────────────────────────────────

test('scaffoldDesignSystem: creates DESIGN.md with all canonical sections', () => {
  const { root } = mkProject();
  try {
    const result = scaffoldDesignSystem(root, { name: 'TestApp' });
    assert.equal(result.ok, true);
    assert.equal(result.exists, false);
    assert.ok(existsSync(result.path));
    const text = readFileSync(result.path, 'utf8');

    // Frontmatter present
    assert.match(text, /^---\n/);
    assert.match(text, /version: alpha/);
    assert.match(text, /name: TestApp/);

    // Every canonical section appears
    for (const sec of SECTION_ORDER) {
      assert.ok(text.includes(`## ${sec}`),
        `expected section "## ${sec}" in scaffold, got:\n${text.slice(0, 400)}`);
    }

    // Sections come out in detector in the canonical order
    const d = detectDesignSystem(root);
    assert.deepEqual(d.sections, SECTION_ORDER);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('scaffoldDesignSystem: refuses to overwrite without force:true', () => {
  const { root } = mkProject();
  try {
    writeFileSync(designPath(root), '# hand-edited\n');
    const result = scaffoldDesignSystem(root);
    assert.equal(result.ok, false);
    assert.equal(result.exists, true);
    assert.match(readFileSync(designPath(root), 'utf8'), /hand-edited/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('scaffoldDesignSystem: force:true overwrites', () => {
  const { root } = mkProject();
  try {
    writeFileSync(designPath(root), '# old\n');
    const result = scaffoldDesignSystem(root, { name: 'Fresh', force: true });
    assert.equal(result.ok, true);
    assert.match(readFileSync(designPath(root), 'utf8'), /name: Fresh/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('scaffoldDesignSystem: defaults name to project folder basename', () => {
  const { root } = mkProject();
  try {
    const result = scaffoldDesignSystem(root);
    assert.equal(result.ok, true);
    const text = readFileSync(result.path, 'utf8');
    const expected = root.split('/').pop();
    assert.ok(text.includes(`name: ${expected}`),
      `expected "name: ${expected}" in scaffold`);
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

test('GET /design-system reports absent on fresh project', async () => {
  const { root } = mkProject();
  let srv;
  try {
    srv = await startServer(root);
    const r = await fetch(`http://localhost:${srv.port}/design-system`);
    const body = await r.json();
    assert.equal(body.present, false);
  } finally {
    if (srv) await stopServer(srv.child);
    rmSync(root, { recursive: true, force: true });
  }
});

test('POST /design-system/scaffold creates DESIGN.md, GET reflects it', async () => {
  const { root } = mkProject();
  let srv;
  try {
    srv = await startServer(root);
    const post = await fetch(`http://localhost:${srv.port}/design-system/scaffold`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'EndpointApp' }),
    });
    assert.equal(post.status, 200);
    const created = await post.json();
    assert.equal(created.ok, true);

    const get = await fetch(`http://localhost:${srv.port}/design-system`);
    const detected = await get.json();
    assert.equal(detected.present, true);
    assert.deepEqual(detected.sections, SECTION_ORDER);
  } finally {
    if (srv) await stopServer(srv.child);
    rmSync(root, { recursive: true, force: true });
  }
});

test('POST /design-system/scaffold returns 409 when file exists without force', async () => {
  const { root } = mkProject();
  writeFileSync(designPath(root), '# hand\n');
  let srv;
  try {
    srv = await startServer(root);
    const r = await fetch(`http://localhost:${srv.port}/design-system/scaffold`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(r.status, 409);
    const body = await r.json();
    assert.equal(body.exists, true);
  } finally {
    if (srv) await stopServer(srv.child);
    rmSync(root, { recursive: true, force: true });
  }
});
