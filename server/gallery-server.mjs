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

  // GET /mockups → file list
  if (req.method === 'GET' && pathname === '/mockups') {
    try {
      const files = fs.readdirSync(MOCKUP_DIR)
        .filter(f => f.endsWith('.html'))
        .map(f => {
          const stat = fs.statSync(path.join(MOCKUP_DIR, f));
          return {
            file: f,
            name: f.replace(/\.html$/, '').replace(/[-_]/g, ' '),
            modified: stat.mtime.toISOString(),
            size: stat.size,
          };
        })
        .sort((a, b) => b.modified.localeCompare(a.modified));
      return json(res, files);
    } catch (e) {
      return json(res, { error: e.message }, 500);
    }
  }

  // GET /mockup/<filename>
  if (req.method === 'GET' && pathname.startsWith('/mockup/')) {
    const filename = decodeURIComponent(pathname.slice('/mockup/'.length));
    // Safety: no path traversal
    if (filename.includes('..') || filename.includes('/')) return notFound(res);
    return serveFile(res, path.join(MOCKUP_DIR, filename), 'text/html; charset=utf-8');
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
