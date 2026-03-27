import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const storageDir = join(process.cwd(), '.mockup-gallery');
const selectionsPath = join(storageDir, 'selections.json');
const implementedPath = join(storageDir, 'implemented.json');
const acceptedPath = join(storageDir, 'accepted-designs.json');

function readJson(p) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

// No gallery data — stay silent
if (!existsSync(selectionsPath)) process.exit(0);

const selections = readJson(selectionsPath);
const implemented = readJson(implementedPath) || {};
const accepted = readJson(acceptedPath);

if (!selections || !selections.selections) process.exit(0);

const items = selections.selections;
const counts = { yay: 0, maybe: 0, ok: 0, nay: 0, unrated: 0 };
const needsAttention = [];

for (const item of items) {
  const r = item.rating || 'unrated';
  counts[r] = (counts[r] || 0) + 1;
  if (r === 'unrated' || r === 'ok') {
    needsAttention.push({ file: item.file, rating: r, note: item.note });
  }
}

const implCount = Object.keys(implemented).length;

// Build summary
const lines = [];
lines.push('[Mockup Gallery] Design review status:');
lines.push(`  ${counts.yay} approved, ${counts.maybe} maybe, ${counts.ok} changes, ${counts.nay} rejected, ${counts.unrated} unrated`);

if (implCount > 0) {
  const implSummary = Object.entries(implemented).map(([file, data]) => {
    const total = Object.keys(data.components || {}).length;
    const done = Object.values(data.components || {}).filter(c => c.status === 'implemented').length;
    return `${file.replace('.html','')} [${done}/${total}]`;
  }).join(', ');
  lines.push(`  Implemented: ${implSummary}`);
}

if (needsAttention.length > 0) {
  lines.push(`  Needs attention: ${needsAttention.map(n => n.file.replace('.html','')).join(', ')}`);
  // Include notes for items with feedback
  for (const n of needsAttention) {
    if (n.note) lines.push(`    ${n.file}: "${n.note}"`);
  }
}

if (accepted?.design_patterns?.approved) {
  lines.push(`  ${accepted.design_patterns.approved.length} approved design patterns available`);
}

lines.push('  Run /mockup-status for full details or /mockup-review to open gallery.');

process.stdout.write(lines.join('\n') + '\n');
