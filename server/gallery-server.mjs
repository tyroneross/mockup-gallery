#!/usr/bin/env node
import http from 'http';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GALLERY_DIR = path.resolve(__dirname, '../gallery');

// ── CLI flags ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function flag(name) {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : null;
}

const PROJECT_ROOT = path.resolve(flag('--project') || process.cwd());
let MOCKUP_DIR = flag('--dir') ? path.resolve(flag('--dir')) : null;
const PORT_START = parseInt(flag('--port') || '8787', 10);

// Auto-scan for mockup dir
if (!MOCKUP_DIR) {
  const candidates = ['mockups', 'docs/mockups', '.claude/mockups'];
  for (const c of candidates) {
    const p = path.join(PROJECT_ROOT, c);
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
      MOCKUP_DIR = p;
      break;
    }
  }
}
if (!MOCKUP_DIR) {
  console.error('No mockup directory found. Pass --dir <path> or create mockups/, docs/mockups/, or .claude/mockups/ in project root.');
  process.exit(1);
}

// ── Storage dir + migration ───────────────────────────────────────────────
const STORAGE_DIR = path.join(PROJECT_ROOT, '.mockup-gallery');
const LEGACY_DIR = path.join(PROJECT_ROOT, '.atomize-gallery');

if (!fs.existsSync(STORAGE_DIR)) {
  if (fs.existsSync(LEGACY_DIR)) {
    fs.cpSync(LEGACY_DIR, STORAGE_DIR, { recursive: true });
    console.log(`Migrated .atomize-gallery → .mockup-gallery`);
  } else {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-cache');
}

function json(res, data, status = 200) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function notFound(res, msg = 'Not found') {
  cors(res);
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end(msg);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function serveFile(res, filePath, mime) {
  try {
    const data = fs.readFileSync(filePath);
    cors(res);
    res.writeHead(200, { 'Content-Type': mime || MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    notFound(res);
  }
}

function readJsonFile(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function getProjectLastChange() {
  try {
    const ts = execSync('git log -1 --format=%ct', { cwd: PROJECT_ROOT, stdio: ['pipe','pipe','pipe'] }).toString().trim();
    return parseInt(ts, 10) * 1000;
  } catch {
    let latest = 0;
    for (const dir of ['src', 'app', 'components']) {
      const full = path.join(PROJECT_ROOT, dir);
      if (!fs.existsSync(full)) continue;
      try { if (fs.statSync(full).mtimeMs > latest) latest = fs.statSync(full).mtimeMs; } catch {}
    }
    return latest || Date.now();
  }
}

// ── Request handler ───────────────────────────────────────────────────────
function handler(req, res) {
  const url = new URL(req.url, `http://localhost`);
  const pathname = url.pathname;

  if (req.method === 'OPTIONS') {
    cors(res); res.writeHead(204); res.end(); return;
  }

  // GET / → gallery.html
  if (req.method === 'GET' && pathname === '/') {
    return serveFile(res, path.join(GALLERY_DIR, 'gallery.html'), 'text/html; charset=utf-8');
  }

  // GET /mockups → file list (main + archive)
  if (req.method === 'GET' && pathname === '/mockups') {
    try {
      const mainFiles = fs.readdirSync(MOCKUP_DIR)
        .filter(f => f.endsWith('.html'))
        .map(f => {
          const stat = fs.statSync(path.join(MOCKUP_DIR, f));
          return {
            file: f,
            name: f.replace(/\.html$/, '').replace(/[-_]/g, ' '),
            modified: stat.mtime.toISOString(),
            modifiedMs: stat.mtimeMs,
            size: stat.size,
            archived: false,
          };
        });
      const archiveDir = path.join(MOCKUP_DIR, 'archive');
      const archiveFiles = fs.existsSync(archiveDir)
        ? fs.readdirSync(archiveDir)
            .filter(f => f.endsWith('.html'))
            .map(f => {
              const stat = fs.statSync(path.join(archiveDir, f));
              return {
                file: f,
                name: f.replace(/\.html$/, '').replace(/[-_]/g, ' '),
                modified: stat.mtime.toISOString(),
                modifiedMs: stat.mtimeMs,
                size: stat.size,
                archived: true,
              };
            })
        : [];
      const files = [...mainFiles, ...archiveFiles]
        .sort((a, b) => b.modifiedMs - a.modifiedMs);
      return json(res, files);
    } catch (e) {
      return json(res, { error: e.message }, 500);
    }
  }

  // GET /mockup/<filename> — try main dir, then archive
  if (req.method === 'GET' && pathname.startsWith('/mockup/')) {
    const filename = decodeURIComponent(pathname.slice('/mockup/'.length));
    // Safety: no path traversal
    if (filename.includes('..') || filename.includes('/')) return notFound(res);
    const mainPath = path.join(MOCKUP_DIR, filename);
    if (fs.existsSync(mainPath)) return serveFile(res, mainPath, 'text/html; charset=utf-8');
    const archivePath = path.join(MOCKUP_DIR, 'archive', filename);
    if (fs.existsSync(archivePath)) return serveFile(res, archivePath, 'text/html; charset=utf-8');
    return notFound(res);
  }

  // POST /save
  if (req.method === 'POST' && pathname === '/save') {
    readBody(req).then(body => {
      const dest = path.join(STORAGE_DIR, 'selections.json');
      fs.writeFileSync(dest, body, 'utf8');
      json(res, { ok: true });
    }).catch(e => json(res, { error: e.message }, 500));
    return;
  }

  // GET /selections
  if (req.method === 'GET' && pathname === '/selections') {
    const data = readJsonFile(path.join(STORAGE_DIR, 'selections.json'));
    return json(res, data || {});
  }

  // GET /accepted
  if (req.method === 'GET' && pathname === '/accepted') {
    const data = readJsonFile(path.join(STORAGE_DIR, 'accepted-designs.json'));
    return json(res, data || {});
  }

  // GET /project-info
  if (req.method === 'GET' && pathname === '/project-info') {
    const lastChange = getProjectLastChange();
    let projectName = path.basename(PROJECT_ROOT);
    try { const pkg = readJsonFile(path.join(PROJECT_ROOT, 'package.json')); if (pkg?.name) projectName = pkg.name; } catch {}
    return json(res, { projectName, lastChange, lastChangeISO: new Date(lastChange).toISOString() });
  }

  // POST /archive/<filename> — move to archive subfolder
  if (req.method === 'POST' && pathname.startsWith('/archive/')) {
    const filename = decodeURIComponent(pathname.slice('/archive/'.length));
    if (filename.includes('..') || filename.includes('/')) return json(res, { error: 'invalid filename' }, 400);
    const src = path.join(MOCKUP_DIR, filename);
    const archiveDir = path.join(MOCKUP_DIR, 'archive');
    const dest = path.join(archiveDir, filename);
    if (!fs.existsSync(src)) return json(res, { error: 'file not found' }, 404);
    if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
    fs.renameSync(src, dest);
    return json(res, { ok: true, archived: filename });
  }

  // POST /unarchive/<filename> — move back from archive
  if (req.method === 'POST' && pathname.startsWith('/unarchive/')) {
    const filename = decodeURIComponent(pathname.slice('/unarchive/'.length));
    if (filename.includes('..') || filename.includes('/')) return json(res, { error: 'invalid filename' }, 400);
    const src = path.join(MOCKUP_DIR, 'archive', filename);
    const dest = path.join(MOCKUP_DIR, filename);
    if (!fs.existsSync(src)) return json(res, { error: 'file not found in archive' }, 404);
    fs.renameSync(src, dest);
    return json(res, { ok: true, unarchived: filename });
  }

  // GET /implemented
  if (req.method === 'GET' && pathname === '/implemented') {
    const data = readJsonFile(path.join(STORAGE_DIR, 'implemented.json'));
    return json(res, data || {});
  }

  // POST /implement
  if (req.method === 'POST' && pathname === '/implement') {
    readBody(req).then(body => {
      const update = JSON.parse(body);
      const filePath = path.join(STORAGE_DIR, 'implemented.json');
      const existing = readJsonFile(filePath) || {};
      const { file, component, status, codePath } = update;
      if (!file) return json(res, { error: 'file required' }, 400);
      if (!existing[file]) existing[file] = { status: 'designed', date: new Date().toISOString().split('T')[0], components: {} };
      if (component) {
        existing[file].components[component] = { status: status || 'implemented', file: codePath || null };
        const compStatuses = Object.values(existing[file].components).map(c => c.status);
        if (compStatuses.every(s => s === 'implemented')) existing[file].status = 'implemented';
        else if (compStatuses.some(s => s === 'implemented')) existing[file].status = 'partial';
        else existing[file].status = 'designed';
      } else {
        existing[file].status = status || 'implemented';
      }
      existing[file].date = new Date().toISOString().split('T')[0];
      fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));
      json(res, { ok: true, implemented: existing[file] });
    }).catch(e => json(res, { error: e.message }, 500));
    return;
  }

  // Static files from gallery dir (CSS, JS, etc.)
  if (req.method === 'GET') {
    const rel = pathname.replace(/^\//, '');
    if (!rel.includes('..')) {
      const candidate = path.join(GALLERY_DIR, rel);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return serveFile(res, candidate);
      }
    }
  }

  notFound(res);
}

// ── Port auto-increment ───────────────────────────────────────────────────
function tryListen(port) {
  const server = http.createServer(handler);
  server.on('error', e => {
    if (e.code === 'EADDRINUSE') {
      console.log(`Port ${port} in use, trying ${port + 1}...`);
      tryListen(port + 1);
    } else {
      console.error(e);
      process.exit(1);
    }
  });
  server.listen(port, '127.0.0.1', () => {
    const url = `http://localhost:${port}`;
    console.log(`Mockup Gallery`);
    console.log(`  URL:      ${url}`);
    console.log(`  Mockups:  ${MOCKUP_DIR}`);
    console.log(`  Storage:  ${STORAGE_DIR}`);
    // Try to open browser
    try {
      const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
      execSync(`${cmd} ${url}`, { stdio: 'ignore' });
    } catch {}
  });
}

tryListen(PORT_START);
