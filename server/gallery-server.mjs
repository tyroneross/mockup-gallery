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
// Stable port per project: hash project path into 8787-8887 range (unless --port is explicit)
const EXPLICIT_PORT = flag('--port');
const PORT_START = EXPLICIT_PORT
  ? parseInt(EXPLICIT_PORT, 10)
  : 8787 + (Array.from(PROJECT_ROOT).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0) & 0x7fffffff) % 100;

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

// ── Route detection ──────────────────────────────────────────────────────
// Detects pages/screens/views from project structure for the route picker.
// Returns { type, routes: [{ path, label, source }] }
function detectProjectRoutes(root) {
  const result = { type: 'unknown', routes: [] };

  // 1. Next.js / React — app/ directory with page.tsx/jsx files
  for (const base of ['app', 'src/app']) {
    const appDir = path.join(root, base);
    if (fs.existsSync(appDir) && fs.statSync(appDir).isDirectory()) {
      result.type = 'nextjs';
      scanNextRoutes(appDir, '/', result.routes);
      if (result.routes.length > 0) return result;
    }
  }

  // 2. Next.js Pages Router — pages/ directory
  for (const base of ['pages', 'src/pages']) {
    const pagesDir = path.join(root, base);
    if (fs.existsSync(pagesDir) && fs.statSync(pagesDir).isDirectory()) {
      result.type = 'nextjs-pages';
      scanPagesRouter(pagesDir, '/', result.routes);
      if (result.routes.length > 0) return result;
    }
  }

  // 3. Swift / SwiftUI — look for .swift view files
  const swiftViews = scanSwiftViews(root);
  if (swiftViews.length > 0) {
    result.type = 'swift';
    result.routes = swiftViews;
    return result;
  }

  // 4. Python (Flask/FastAPI) — scan for route decorators
  const pyRoutes = scanPythonRoutes(root);
  if (pyRoutes.length > 0) {
    result.type = 'python';
    result.routes = pyRoutes;
    return result;
  }

  // 5. Manual route manifest — .mockup-gallery/routes.json
  const manifestPath = path.join(root, '.mockup-gallery', 'routes.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (Array.isArray(manifest.routes) && manifest.routes.length > 0) {
        result.type = manifest.type || 'custom';
        result.routes = manifest.routes;
        return result;
      }
    } catch { /* ignore parse errors */ }
  }

  // 6. Wouter / React Router SPA — scan for Route components in source
  for (const routerFile of [
    'client/src/App.tsx', 'client/src/App.jsx', 'src/App.tsx', 'src/App.jsx',
    'src/router.tsx', 'src/routes.tsx', 'app/routes.tsx',
  ]) {
    const filePath = path.join(root, routerFile);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        // Match <Route path="..." /> patterns (wouter, react-router, etc.)
        const routeMatches = content.matchAll(/<Route\s+[^>]*path=["']([^"']+)["']/g);
        const routes = [];
        for (const m of routeMatches) {
          const routePath = m[1];
          // Skip dynamic params and redirects
          if (routePath.includes(':') && !routePath.includes('/')) continue;
          const label = routePath === '/'
            ? 'Home'
            : routePath.split('/').filter(Boolean)[0]
                .replace(/[-_]/g, ' ')
                .replace(/\b\w/g, c => c.toUpperCase());
          routes.push({ path: routePath, label, source: routerFile });
        }
        if (routes.length > 0) {
          result.type = 'spa';
          result.routes = routes;
          return result;
        }
      } catch { /* ignore read errors */ }
    }
  }

  // 7. Static / SPA — scan for HTML files
  for (const dir of ['public', 'dist', 'build', 'static']) {
    const d = path.join(root, dir);
    if (fs.existsSync(d)) {
      const htmlFiles = fs.readdirSync(d).filter(f => f.endsWith('.html'));
      if (htmlFiles.length > 0) {
        result.type = 'static';
        result.routes = htmlFiles.map(f => ({
          path: '/' + f.replace(/\.html$/, '').replace(/^index$/, ''),
          label: f.replace(/\.html$/, '') || 'Home',
          source: `${dir}/${f}`
        }));
        return result;
      }
    }
  }

  return result;
}

// Next.js App Router: recursively find page.tsx/jsx files
function scanNextRoutes(dir, routePrefix, routes) {
  const SKIP = new Set(['node_modules', '.next', '.git', 'api', '_components', '_lib']);
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

  const hasPage = entries.some(e =>
    e.isFile() && /^page\.(tsx?|jsx?)$/.test(e.name)
  );
  if (hasPage) {
    const cleanRoute = routePrefix === '/' ? '/' : routePrefix.replace(/\/$/, '');
    const label = cleanRoute === '/'
      ? 'Home'
      : cleanRoute.split('/').filter(Boolean).pop()
          .replace(/^\[.*\]$/, ':param')
          .replace(/[-_]/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase());
    routes.push({ path: cleanRoute, label, source: 'app/' + cleanRoute });
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (SKIP.has(entry.name)) continue;
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
    // Skip route groups like (marketing) — don't add to path
    const isGroup = /^\(.*\)$/.test(entry.name);
    const nextPrefix = isGroup
      ? routePrefix
      : routePrefix + entry.name + '/';
    scanNextRoutes(path.join(dir, entry.name), nextPrefix, routes);
  }
}

// Next.js Pages Router
function scanPagesRouter(dir, routePrefix, routes) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

  for (const entry of entries) {
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
    if (entry.name === 'api') continue;
    const full = path.join(dir, entry.name);
    if (entry.isFile() && /\.(tsx?|jsx?)$/.test(entry.name)) {
      const name = entry.name.replace(/\.(tsx?|jsx?)$/, '');
      const route = name === 'index' ? routePrefix : routePrefix + name;
      routes.push({ path: route, label: name === 'index' ? 'Home' : name.replace(/[-_]/g, ' '), source: full });
    } else if (entry.isDirectory()) {
      scanPagesRouter(full, routePrefix + entry.name + '/', routes);
    }
  }
}

// Swift/SwiftUI — find View files (files containing ": View" or "View {")
function scanSwiftViews(root) {
  const views = [];
  const SKIP = new Set(['.build', '.git', 'DerivedData', 'Pods', 'node_modules', 'Packages']);
  const seen = new Set();

  function walk(dir, depth) {
    if (depth > 6) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

    for (const entry of entries) {
      if (SKIP.has(entry.name) || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (entry.name.endsWith('.swift') && entry.name.includes('View')) {
        const viewName = entry.name.replace('.swift', '');
        if (seen.has(viewName)) continue;
        seen.add(viewName);

        // Derive a readable label: "SessionDetailView" → "Session Detail"
        const label = viewName
          .replace(/View$/, '')
          .replace(/([a-z])([A-Z])/g, '$1 $2');

        // Determine platform from path
        const relPath = path.relative(root, full);
        let platform = 'shared';
        if (/\biOS\b/i.test(relPath)) platform = 'ios';
        else if (/\bmacOS\b/i.test(relPath)) platform = 'macos';
        else if (/\bwatchOS\b/i.test(relPath)) platform = 'watchos';
        else if (/\bShared\b/i.test(relPath)) platform = 'shared';

        views.push({
          path: viewName,
          label: label,
          source: relPath,
          platform
        });
      }
    }
  }

  walk(root, 0);

  // Sort: shared first, then by name
  views.sort((a, b) => {
    if (a.platform === 'shared' && b.platform !== 'shared') return -1;
    if (b.platform === 'shared' && a.platform !== 'shared') return 1;
    return a.label.localeCompare(b.label);
  });

  return views;
}

// Python — scan for @app.route / @router.get / @app.get decorators
function scanPythonRoutes(root) {
  const routes = [];
  const seen = new Set();

  function walk(dir, depth) {
    if (depth > 4) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '__pycache__' || entry.name === '.venv' || entry.name === 'venv') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (entry.name.endsWith('.py')) {
        try {
          const content = fs.readFileSync(full, 'utf8');
          const routePattern = /@(?:app|router|api)\.(get|post|route|put|delete|patch)\s*\(\s*["']([^"']+)/gi;
          let match;
          while ((match = routePattern.exec(content)) !== null) {
            const route = match[2];
            if (!seen.has(route)) {
              seen.add(route);
              routes.push({
                path: route,
                label: route.replace(/^\//, '').replace(/[{}<>]/g, ':').replace(/[-_\/]/g, ' ') || 'Root',
                source: path.relative(root, full)
              });
            }
          }
        } catch {}
      }
    }
  }

  walk(root, 0);
  return routes;
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
      const EXCLUDE = new Set(['gallery-v2.html', 'atomize-gallery.html', 'gallery.html', 'selected', 'archive']);
      const mainFiles = fs.readdirSync(MOCKUP_DIR)
        .filter(f => f.endsWith('.html') && !EXCLUDE.has(f))
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

  // GET /selected — return selected build
  if (req.method === 'GET' && pathname === '/selected') {
    const data = readJsonFile(path.join(STORAGE_DIR, 'selected.json'));
    return json(res, data || { pages: {}, components: {} });
  }

  // POST /selected — update selected.json + copy files to selected/ folder
  if (req.method === 'POST' && pathname === '/selected') {
    readBody(req).then(body => {
      const data = JSON.parse(body);
      fs.writeFileSync(path.join(STORAGE_DIR, 'selected.json'), JSON.stringify(data, null, 2), 'utf8');
      fs.writeFileSync(path.join(STORAGE_DIR, 'last-change.json'), JSON.stringify({
        timestamp: new Date().toISOString(), source: 'selected-update'
      }));
      // Copy selected source files to selected/ folder
      const selectedDir = path.join(MOCKUP_DIR, 'selected');
      if (!fs.existsSync(selectedDir)) fs.mkdirSync(selectedDir, { recursive: true });
      // Clear old selected files
      try { fs.readdirSync(selectedDir).forEach(f => fs.unlinkSync(path.join(selectedDir, f))); } catch {}
      // Copy current selections
      if (data.pages) {
        for (const [route, info] of Object.entries(data.pages)) {
          const src = path.join(MOCKUP_DIR, info.source);
          if (fs.existsSync(src)) {
            fs.copyFileSync(src, path.join(selectedDir, info.source));
          }
        }
      }
      json(res, { ok: true });
    }).catch(e => json(res, { error: e.message }, 500));
    return;
  }

  // POST /save-accepted — write accepted-designs.json
  if (req.method === 'POST' && pathname === '/save-accepted') {
    readBody(req).then(body => {
      fs.writeFileSync(path.join(STORAGE_DIR, 'accepted-designs.json'), body, 'utf8');
      fs.writeFileSync(path.join(STORAGE_DIR, 'last-change.json'), JSON.stringify({
        timestamp: new Date().toISOString(),
        source: 'finalize-accepted'
      }));
      json(res, { ok: true });
    }).catch(e => json(res, { error: e.message }, 500));
    return;
  }

  // POST /save
  if (req.method === 'POST' && pathname === '/save') {
    readBody(req).then(body => {
      const dest = path.join(STORAGE_DIR, 'selections.json');
      fs.writeFileSync(dest, body, 'utf8');
      // Write change marker so Claude Code can detect updates
      fs.writeFileSync(path.join(STORAGE_DIR, 'last-change.json'), JSON.stringify({
        timestamp: new Date().toISOString(),
        source: 'gallery-save'
      }));
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

  // GET /routes — auto-detect project pages/screens/views
  if (req.method === 'GET' && pathname === '/routes') {
    const detected = detectProjectRoutes(PROJECT_ROOT);
    return json(res, detected);
  }

  // POST /share-with-claude — build pending-review.json from selections + selected
  if (req.method === 'POST' && pathname === '/share-with-claude') {
    try {
      const selections = readJsonFile(path.join(STORAGE_DIR, 'selections.json')) || {};
      const selected   = readJsonFile(path.join(STORAGE_DIR, 'selected.json'))   || {};

      // Build ratings array from selections.selections array
      const ratings = [];
      const items = Array.isArray(selections.selections) ? selections.selections : [];
      for (const item of items) {
        const entry = { mockup: (item.file || item.name || '').replace(/\.html$/, ''), rating: item.rating || 'unrated' };
        entry.note = item.note || null;
        // Gather component-level comments (names that look like feedback + notes)
        const comments = [];
        for (const comp of (item.components || [])) {
          if (comp.name && comp.name.length > 30 && /[.!,]|should|remove|add|change|simplify|move|fix|need|don't|instead/i.test(comp.name)) {
            comments.push(comp.name.trim());
          }
          if (comp.note && typeof comp.note === 'string' && comp.note.trim()) {
            comments.push(comp.note.trim());
          }
        }
        if (comments.length > 0) entry.comments = comments;
        ratings.push(entry);
      }

      // Build selections map from selected.json pages
      const selectionMap = {};
      if (selected.pages) {
        for (const [route, info] of Object.entries(selected.pages)) {
          selectionMap[route] = { mockup: info.source || null, note: info.note || null };
        }
      }

      // Summary counts
      const yayCount      = ratings.filter(r => r.rating === 'yay').length;
      const nayCount      = ratings.filter(r => r.rating === 'nay').length;
      const unratedCount  = ratings.filter(r => r.rating === 'unrated').length;
      const pageCount     = Object.keys(selectionMap).length;
      const commentCount  = ratings.reduce((n, r) => n + (r.comments ? r.comments.length : 0), 0);

      let projectName = path.basename(PROJECT_ROOT);
      try { const pkg = readJsonFile(path.join(PROJECT_ROOT, 'package.json')); if (pkg?.name) projectName = pkg.name; } catch {}

      const review = {
        sharedAt: new Date().toISOString(),
        project: projectName,
        ratings,
        selections: selectionMap,
        summary: `${ratings.length} rated (${yayCount} yay, ${nayCount} nay, ${unratedCount} unrated), ${pageCount} page${pageCount !== 1 ? 's' : ''} selected, ${commentCount} comment${commentCount !== 1 ? 's' : ''}`,
      };

      const dest = path.join(STORAGE_DIR, 'pending-review.json');
      fs.writeFileSync(dest, JSON.stringify(review, null, 2), 'utf8');
      console.log(`[share-with-claude] wrote ${dest}`);
      return json(res, { ok: true, file: 'pending-review.json' });
    } catch (e) {
      return json(res, { error: e.message }, 500);
    }
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
    const projectName = path.basename(PROJECT_ROOT);
    console.log(`Mockup Gallery — ${projectName}`);
    console.log(`  URL:      ${url}`);
    console.log(`  Project:  ${PROJECT_ROOT}`);
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
