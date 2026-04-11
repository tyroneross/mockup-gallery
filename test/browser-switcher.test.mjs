// Grader 4: UI session switcher (headless browser)
//
// If Playwright or Puppeteer is available, drives a real browser against the
// gallery-server running on the multi-session fixture. Otherwise skips with a
// clear message — no browser dependency was available when this test ran.
//
// Run: node --test test/browser-switcher.test.mjs

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

async function tryImport(name) {
  try {
    const mod = await import(name);
    return mod;
  } catch {
    return null;
  }
}

let browserMod = null;
let browserFlavor = null;
const playwright = await tryImport('playwright');
if (playwright?.chromium) {
  browserMod = playwright;
  browserFlavor = 'playwright';
} else {
  const puppeteer = await tryImport('puppeteer');
  if (puppeteer?.default?.launch || puppeteer?.launch) {
    browserMod = puppeteer;
    browserFlavor = 'puppeteer';
  }
}

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

if (browserMod) {
  before(async () => {
    state.tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-browser-'));
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
}

test('session switcher UI drives POST /session/switch', async (t) => {
  if (!browserMod) {
    t.skip('browser not available — skipping grader 4 (neither playwright nor puppeteer installed)');
    return;
  }

  let browser, page;
  if (browserFlavor === 'playwright') {
    browser = await browserMod.chromium.launch({ headless: true });
    const context = await browser.newContext();
    page = await context.newPage();
  } else {
    const launch = browserMod.default?.launch || browserMod.launch;
    browser = await launch({ headless: 'new' });
    page = await browser.newPage();
  }

  try {
    await page.goto(state.baseUrl);
    // Wait for session pill to render (guard against gallery being still loading)
    await page.waitForSelector('#session-pill', { timeout: 5000 });

    const pillVisible = await page.$('#session-pill');
    assert.ok(pillVisible, '#session-pill should be present');

    const pillNameText = await page.$eval('#session-pill-name', (el) => el.textContent || '');
    assert.ok(pillNameText.length > 0, '#session-pill-name should have text');

    const badgeStatus = await page.$eval('#session-pill-badge', (el) => el.getAttribute('data-status'));
    assert.ok(badgeStatus && ['active', 'decided', 'stale', 'superseded'].includes(badgeStatus));

    // Open dropdown
    await page.click('#session-pill-toggle');
    await page.waitForTimeout ? page.waitForTimeout(200) : new Promise((r) => setTimeout(r, 200));

    // Find session rows in dropdown
    const rowCount = await page.$$eval('[data-session-slug]', (rows) => rows.length);
    assert.ok(rowCount >= 2, `dropdown should have >=2 session rows, got ${rowCount}`);

    // Click the other session
    await page.click('[data-session-slug="2026-03-15-icons"]');
    await new Promise((r) => setTimeout(r, 400));

    // Confirm switch happened via /sessions
    const resp = await fetch(`${state.baseUrl}/sessions`);
    const body = await resp.json();
    assert.equal(body.currentSession, '2026-03-15-icons');

    // Screenshot evidence
    const screenshotDir = path.join(repoRoot, '.build-loop/evals/screenshots');
    fs.mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, 'session-switcher.png') });
  } finally {
    await browser.close();
  }
});
