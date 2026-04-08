import { readFileSync, existsSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

// ── Registry auto-registration ──────────────────────────────────────────
function registerProject(pluginRoot, projectPath) {
  if (!pluginRoot) return;
  const registryPath = join(pluginRoot, 'registry.json');
  let registry = { projects: {} };
  try { registry = JSON.parse(readFileSync(registryPath, 'utf8')); } catch { /* new registry */ }
  const name = projectPath.split('/').pop();
  registry.projects[name] = {
    path: projectPath,
    lastSeen: new Date().toISOString()
  };
  try {
    writeFileSync(registryPath, JSON.stringify(registry, null, 2));
  } catch { /* silent — registry is optional */ }
}

// ── Global memory reader ────────────────────────────────────────────────
function readGlobalMemories(pluginRoot, projectName) {
  if (!pluginRoot) return [];
  const memLines = [];
  const globalDir = join(pluginRoot, 'memories', 'global');
  const projectDir = join(pluginRoot, 'memories', 'projects', projectName);

  for (const dir of [globalDir, projectDir]) {
    if (!existsSync(dir)) continue;
    try {
      const files = readdirSync(dir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const content = readFileSync(join(dir, file), 'utf8').trim();
        // Skip files that only have the starter template
        if (content.includes('<!-- Add entries as they are promoted')) continue;
        const label = dir === globalDir ? 'Global' : `Project (${projectName})`;
        memLines.push(`  ${label}: ${file.replace('.md', '').replace(/-/g, ' ')}`);
      }
    } catch { /* silent */ }
  }
  return memLines;
}

const storageDir = join(process.cwd(), '.mockup-gallery');
const selectionsPath = join(storageDir, 'selections.json');
const selectedPath = join(storageDir, 'selected.json');
const implementedPath = join(storageDir, 'implemented.json');
const acceptedPath = join(storageDir, 'accepted-designs.json');

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || null;
const projectPath = process.cwd();
const projectName = projectPath.split('/').pop();

// Auto-register this project (silent)
registerProject(pluginRoot, projectPath);

function readJson(p) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

// No gallery data — stay silent
if (!existsSync(selectionsPath) && !existsSync(selectedPath)) process.exit(0);

const selections = readJson(selectionsPath);
const selected = readJson(selectedPath);
const implemented = readJson(implementedPath) || {};
const accepted = readJson(acceptedPath);

const lines = [];
lines.push('[Mockup Gallery] Design review status:');

// Rating counts
if (selections?.selections) {
  const items = selections.selections;
  const counts = { yay: 0, nay: 0, unrated: 0 };
  for (const item of items) {
    const r = item.rating || 'unrated';
    counts[r] = (counts[r] || 0) + 1;
  }
  lines.push(`  ${counts.yay} approved, ${counts.nay} rejected, ${counts.unrated} unrated`);

  // Collect feedback comments
  const comments = [];
  for (const item of items) {
    const name = item.file.replace('.html', '');
    if (item.note) {
      comments.push({ mockup: name, comment: item.note });
    }
    for (const comp of (item.components || [])) {
      if (comp.name && comp.name.length > 30 && /[.!,]|should|remove|add|change|simplify|move|fix|need|don't|instead/i.test(comp.name)) {
        comments.push({ mockup: name, comment: comp.name });
      }
      if (comp.note) {
        comments.push({ mockup: name, component: comp.name, comment: comp.note });
      }
    }
  }

  if (comments.length > 0) {
    lines.push('  Comments:');
    for (const c of comments) {
      const prefix = c.component ? `${c.mockup} > ${c.component}` : c.mockup;
      lines.push(`    ${prefix}: "${c.comment}"`);
    }
  }
}

// Selected build — split into pending vs done
if (selected) {
  const pages = Object.entries(selected.pages || {});
  const pending = pages.filter(([, d]) => d.status !== 'done');
  const done = pages.filter(([, d]) => d.status === 'done');
  const savedCount = (selected.saved || []).length;

  if (pages.length > 0 || savedCount > 0) {
    const parts = [];
    if (pending.length > 0) parts.push(`${pending.length} pending`);
    if (done.length > 0) parts.push(`${done.length} done`);
    if (savedCount > 0) parts.push(`${savedCount} saved for later`);
    lines.push(`  Selected build: ${parts.join(', ')}`);
  }

  // PENDING CHANGES — this is what Claude Code should focus on
  if (pending.length > 0) {
    lines.push('');
    lines.push('  PENDING DESIGN CHANGES (implement these):');
    for (const [route, data] of pending) {
      lines.push(`    ${route} ← mockup: ${data.source}`);
      if (data.changeNote) {
        lines.push(`      Change: ${data.changeNote}`);
      } else {
        lines.push(`      Change: (no description — open gallery to add one)`);
      }
      lines.push(`      Mockup file: mockups/${data.source}`);
    }
    lines.push('');
    lines.push('  When implementing pending changes:');
    lines.push('  - Read the mockup HTML file to understand the target design');
    lines.push('  - If a change description exists, ONLY modify those specific aspects');
    lines.push('  - Do NOT restructure or restyle parts of the UI not mentioned in the change description');
    lines.push('  - Compare the mockup against the current implementation to identify deltas');
  }

  // Done items — just list for reference
  if (done.length > 0) {
    lines.push(`  Implemented: ${done.map(([route]) => route).join(', ')}`);
  }
}

// Implementation tracking from implemented.json
const implCount = Object.keys(implemented).length;
if (implCount > 0) {
  const implSummary = Object.entries(implemented).map(([file, data]) => {
    const total = Object.keys(data.components || {}).length;
    const doneCount = Object.values(data.components || {}).filter(c => c.status === 'implemented').length;
    return `${file.replace('.html', '')} [${doneCount}/${total}]`;
  }).join(', ');
  lines.push(`  Component tracking: ${implSummary}`);
}

if (accepted?.design_patterns?.approved) {
  lines.push(`  ${accepted.design_patterns.approved.length} approved design patterns available`);
}

// Surface global memories if any have content
const memLines = readGlobalMemories(pluginRoot, projectName);
if (memLines.length > 0) {
  lines.push('  Design memories:');
  lines.push(...memLines);
}

process.stdout.write(lines.join('\n') + '\n');
