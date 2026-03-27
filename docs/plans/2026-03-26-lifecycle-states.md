# Mockup Lifecycle States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Active/Implemented/Archive lifecycle states to the mockup gallery plugin with git-relative timestamps, repo-level archiving, and component implementation tracking.

**Architecture:** Server gets 4 new endpoints (project-info, archive, implement, implemented). Gallery sidebar reorganizes into Active/Implemented/Archive based on file timestamps relative to last git commit and rating/implementation state.

**Tech Stack:** Node.js (zero deps), HTML/CSS/JS

**Spec:** `DESIGN.md`

---

## File Structure

| File | Change | Responsibility |
|------|--------|---------------|
| `server/gallery-server.mjs` | Modify | Add 4 endpoints, scan archive subfolder, git timestamp |
| `gallery/gallery.html` | Modify | Sidebar lifecycle sections, archive/implement buttons |

---

### Task 1: Add project-info endpoint to server

**Files:**
- Modify: `server/gallery-server.mjs`

- [ ] **Step 1: Add git timestamp helper after the `readJsonFile` function (~line 103)**

```javascript
function getProjectLastChange() {
  try {
    const ts = execSync('git log -1 --format=%ct', { cwd: PROJECT_ROOT, stdio: ['pipe','pipe','pipe'] }).toString().trim();
    return parseInt(ts, 10) * 1000; // Convert to ms
  } catch {
    // No git — scan src/app/components for most recent mtime
    let latest = 0;
    for (const dir of ['src', 'app', 'components']) {
      const full = path.join(PROJECT_ROOT, dir);
      if (!fs.existsSync(full)) continue;
      try {
        const stat = fs.statSync(full);
        if (stat.mtimeMs > latest) latest = stat.mtimeMs;
      } catch {}
    }
    return latest || Date.now();
  }
}
```

- [ ] **Step 2: Add GET /project-info endpoint before the static fallback (~line 169)**

```javascript
  // GET /project-info
  if (req.method === 'GET' && pathname === '/project-info') {
    const lastChange = getProjectLastChange();
    let projectName = path.basename(PROJECT_ROOT);
    try {
      const pkg = readJsonFile(path.join(PROJECT_ROOT, 'package.json'));
      if (pkg?.name) projectName = pkg.name;
    } catch {}
    return json(res, { projectName, lastChange, lastChangeISO: new Date(lastChange).toISOString() });
  }
```

- [ ] **Step 3: Commit**

```bash
git add server/gallery-server.mjs
git commit -m "feat: add /project-info endpoint with git timestamp"
```

---

### Task 2: Add archive scanning and POST /archive endpoint

**Files:**
- Modify: `server/gallery-server.mjs`

- [ ] **Step 1: Update GET /mockups to include archive subfolder and `archived` flag**

Replace the existing `/mockups` handler (~lines 120-138) with:

```javascript
  if (req.method === 'GET' && pathname === '/mockups') {
    try {
      const results = [];
      // Scan main dir
      for (const f of fs.readdirSync(MOCKUP_DIR)) {
        if (!f.endsWith('.html')) continue;
        const stat = fs.statSync(path.join(MOCKUP_DIR, f));
        results.push({ file: f, name: f.replace(/\.html$/, '').replace(/[-_]/g, ' '), modified: stat.mtime.toISOString(), modifiedMs: stat.mtimeMs, size: stat.size, archived: false });
      }
      // Scan archive subdir
      const archiveDir = path.join(MOCKUP_DIR, 'archive');
      if (fs.existsSync(archiveDir) && fs.statSync(archiveDir).isDirectory()) {
        for (const f of fs.readdirSync(archiveDir)) {
          if (!f.endsWith('.html')) continue;
          const stat = fs.statSync(path.join(archiveDir, f));
          results.push({ file: f, name: f.replace(/\.html$/, '').replace(/[-_]/g, ' '), modified: stat.mtime.toISOString(), modifiedMs: stat.mtimeMs, size: stat.size, archived: true });
        }
      }
      results.sort((a, b) => b.modifiedMs - a.modifiedMs);
      return json(res, results);
    } catch (e) {
      return json(res, { error: e.message }, 500);
    }
  }
```

- [ ] **Step 2: Update GET /mockup/<filename> to also serve from archive subfolder**

Replace the existing handler (~lines 141-146):

```javascript
  if (req.method === 'GET' && pathname.startsWith('/mockup/')) {
    const filename = decodeURIComponent(pathname.slice('/mockup/'.length));
    if (filename.includes('..') || filename.includes('/')) return notFound(res);
    // Try main dir first, then archive
    const mainPath = path.join(MOCKUP_DIR, filename);
    const archivePath = path.join(MOCKUP_DIR, 'archive', filename);
    if (fs.existsSync(mainPath)) return serveFile(res, mainPath, 'text/html; charset=utf-8');
    if (fs.existsSync(archivePath)) return serveFile(res, archivePath, 'text/html; charset=utf-8');
    return notFound(res);
  }
```

- [ ] **Step 3: Add POST /archive/<filename> endpoint**

```javascript
  // POST /archive/<filename> — move mockup to archive subfolder
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

  // POST /unarchive/<filename> — move mockup back from archive
  if (req.method === 'POST' && pathname.startsWith('/unarchive/')) {
    const filename = decodeURIComponent(pathname.slice('/unarchive/'.length));
    if (filename.includes('..') || filename.includes('/')) return json(res, { error: 'invalid filename' }, 400);
    const src = path.join(MOCKUP_DIR, 'archive', filename);
    const dest = path.join(MOCKUP_DIR, filename);
    if (!fs.existsSync(src)) return json(res, { error: 'file not found in archive' }, 404);
    fs.renameSync(src, dest);
    return json(res, { ok: true, unarchived: filename });
  }
```

- [ ] **Step 4: Commit**

```bash
git add server/gallery-server.mjs
git commit -m "feat: archive scanning + POST /archive and /unarchive endpoints"
```

---

### Task 3: Add implementation tracking endpoints

**Files:**
- Modify: `server/gallery-server.mjs`

- [ ] **Step 1: Add GET /implemented and POST /implement endpoints**

```javascript
  // GET /implemented
  if (req.method === 'GET' && pathname === '/implemented') {
    const data = readJsonFile(path.join(STORAGE_DIR, 'implemented.json'));
    return json(res, data || {});
  }

  // POST /implement — update implemented.json
  if (req.method === 'POST' && pathname === '/implement') {
    readBody(req).then(body => {
      const update = JSON.parse(body);
      const filePath = path.join(STORAGE_DIR, 'implemented.json');
      const existing = readJsonFile(filePath) || {};
      // Merge: update.file + update.component + update.status
      const { file, component, status, codePath } = update;
      if (!file) return json(res, { error: 'file required' }, 400);
      if (!existing[file]) existing[file] = { status: 'designed', date: new Date().toISOString().split('T')[0], components: {} };
      if (component) {
        existing[file].components[component] = { status: status || 'implemented', file: codePath || null };
        // Update overall status
        const compStatuses = Object.values(existing[file].components).map(c => c.status);
        if (compStatuses.every(s => s === 'implemented')) existing[file].status = 'implemented';
        else if (compStatuses.some(s => s === 'implemented')) existing[file].status = 'partial';
        else existing[file].status = 'designed';
      } else {
        existing[file].status = status || 'implemented';
      }
      existing[file].date = new Date().toISOString().split('T')[0];
      fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));
      return json(res, { ok: true, implemented: existing[file] });
    }).catch(e => json(res, { error: e.message }, 500));
    return;
  }
```

- [ ] **Step 2: Commit**

```bash
git add server/gallery-server.mjs
git commit -m "feat: implementation tracking endpoints GET /implemented + POST /implement"
```

---

### Task 4: Update gallery sidebar with lifecycle sections

**Files:**
- Modify: `gallery/gallery.html`

- [ ] **Step 1: Fetch project-info and implemented data on load**

In the gallery's boot JS, after fetching `/mockups`, also fetch:
```javascript
const [mockupsRes, projectRes, implRes, selectionsRes] = await Promise.all([
  fetch('/mockups').then(r => r.json()),
  fetch('/project-info').then(r => r.json()).catch(() => ({ lastChange: 0 })),
  fetch('/implemented').then(r => r.json()).catch(() => ({})),
  fetch('/selections').then(r => r.json()).catch(() => ({})),
]);
```

- [ ] **Step 2: Categorize mockups into Active/Implemented/Archive**

```javascript
function categorize(mockups, projectInfo, implemented, selections) {
  const active = [], impl = [], archived = [];
  const lastChange = projectInfo.lastChange || 0;

  for (const m of mockups) {
    // Archived files (in archive/ subfolder)
    if (m.archived) { archived.push(m); continue; }
    // Implemented (in implemented.json)
    if (implemented[m.file]) {
      m.implStatus = implemented[m.file];
      impl.push(m);
      continue;
    }
    // Active: modified after last project change OR unrated
    m.isRecent = m.modifiedMs >= lastChange;
    active.push(m);
  }

  // Sort active: unrated first, then by mtime newest
  const sel = selections.selections || [];
  const ratedFiles = new Set(sel.filter(s => s.rating && s.rating !== 'unrated').map(s => s.file));
  active.sort((a, b) => {
    const aRated = ratedFiles.has(a.file) ? 1 : 0;
    const bRated = ratedFiles.has(b.file) ? 1 : 0;
    if (aRated !== bRated) return aRated - bRated; // Unrated first
    return b.modifiedMs - a.modifiedMs; // Newest first
  });

  return { active, implemented: impl, archived };
}
```

- [ ] **Step 3: Render sidebar with three sections**

Active section (expanded, prominent):
- Each item shows name + relative age ("2 days ago", "today")
- Unrated items have indigo dot, rated have their rating color

Implemented section (collapsed by default, green accent):
- Each item shows name + implementation progress ("3/5 components")
- Green dot

Archive section (collapsed, muted):
- Each item at 30% opacity, red dot
- "Restore" action available

- [ ] **Step 4: Add Archive button to review bar**

Next to the Reset button, add an "Archive" button that:
```javascript
async function archiveCurrent() {
  if (!confirm(`Archive "${M[S.cur].name}"? It will move to mockups/archive/.`)) return;
  await fetch(`/archive/${encodeURIComponent(M[S.cur].file)}`, { method: 'POST' });
  location.reload(); // Refresh to re-scan
}
```

- [ ] **Step 5: Add "Mark Implemented" button per component**

In the component ratings panel, add a small checkmark button next to each component name:
```javascript
// When clicked:
async function markImplemented(file, component) {
  const codePath = prompt('Code file path (optional):', '');
  await fetch('/implement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file, component, status: 'implemented', codePath: codePath || null })
  });
  // Refresh implemented data
  implData = await fetch('/implemented').then(r => r.json());
  renderComponents();
}
```

Show a green checkmark on components already marked as implemented.

- [ ] **Step 6: Commit**

```bash
git add gallery/gallery.html
git commit -m "feat: lifecycle sidebar — Active/Implemented/Archive with git-relative sorting"
```

---

### Task 5: Update commands to reflect new states

**Files:**
- Modify: `.claude/commands/mockup-status.md`

- [ ] **Step 1: Update mockup-status to show lifecycle breakdown**

The command should now report:
```
Active: 3 (2 unrated, 1 rated)
Implemented: 2 (search-page 3/5, ai-trends 5/5)
Archived: 4
```

- [ ] **Step 2: Commit**

```bash
git add .claude/commands/mockup-status.md
git commit -m "feat: mockup-status shows lifecycle breakdown"
```

---

### Task 6: Test end-to-end

- [ ] **Step 1: Start server against atomize-ai**

```bash
node server/gallery-server.mjs --project ~/Desktop/git-folder/atomize-ai --dir ~/Desktop/git-folder/atomize-ai/docs/mockups
```

- [ ] **Step 2: Verify /project-info**

```bash
curl http://localhost:8787/project-info | jq
```
Expected: `{ "projectName": "atomize-ai", "lastChange": <timestamp>, "lastChangeISO": "..." }`

- [ ] **Step 3: Verify /mockups includes archive flag**

```bash
curl http://localhost:8787/mockups | jq '.[0]'
```
Expected: objects with `archived: false` and `modifiedMs` fields

- [ ] **Step 4: Test archiving**

```bash
curl -X POST http://localhost:8787/archive/03-relevance-scoring.html
ls ~/Desktop/git-folder/atomize-ai/docs/mockups/archive/
```
Expected: file moved to `archive/` subfolder

- [ ] **Step 5: Test unarchiving**

```bash
curl -X POST http://localhost:8787/unarchive/03-relevance-scoring.html
```

- [ ] **Step 6: Test implementation tracking**

```bash
curl -X POST http://localhost:8787/implement -H 'Content-Type: application/json' -d '{"file":"04-search-page.html","component":"Date Preset Buttons","status":"implemented","codePath":"components/v3/V3FilterBar.tsx"}'
curl http://localhost:8787/implemented | jq
```

- [ ] **Step 7: Open gallery in browser, verify sidebar shows Active/Implemented/Archive sections**

- [ ] **Step 8: Commit final state**

```bash
git add -A
git commit -m "test: verified lifecycle states end-to-end"
```
