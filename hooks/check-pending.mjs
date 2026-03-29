import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const storageDir = join(process.cwd(), '.mockup-gallery');
const selectionsPath = join(storageDir, 'selections.json');
const selectedPath = join(storageDir, 'selected.json');
const implementedPath = join(storageDir, 'implemented.json');
const acceptedPath = join(storageDir, 'accepted-designs.json');

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

  // Collect all comments: notes + component-level feedback
  const comments = [];
  for (const item of items) {
    const name = item.file.replace('.html', '');
    if (item.note) {
      comments.push({ mockup: name, comment: item.note });
    }
    for (const comp of (item.components || [])) {
      // Component names that look like feedback (sentence-like, contains spaces + verbs/punctuation)
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

// Selected build summary
if (selected) {
  const pageCount = Object.keys(selected.pages || {}).length;
  const compCount = Object.keys(selected.components || {}).length;
  const savedCount = (selected.saved || []).length;
  if (pageCount > 0 || compCount > 0 || savedCount > 0) {
    const parts = [];
    if (pageCount > 0) parts.push(`${pageCount} pages selected`);
    if (compCount > 0) parts.push(`${compCount} components`);
    if (savedCount > 0) parts.push(`${savedCount} saved for later`);
    lines.push(`  Selected build: ${parts.join(', ')}`);

    // Show page assignments
    for (const [route, data] of Object.entries(selected.pages || {})) {
      lines.push(`    ${route} ← ${data.source}`);
    }
  }
}

// Implementation tracking
const implCount = Object.keys(implemented).length;
if (implCount > 0) {
  const implSummary = Object.entries(implemented).map(([file, data]) => {
    const total = Object.keys(data.components || {}).length;
    const done = Object.values(data.components || {}).filter(c => c.status === 'implemented').length;
    return `${file.replace('.html', '')} [${done}/${total}]`;
  }).join(', ');
  lines.push(`  Implemented: ${implSummary}`);
}

if (accepted?.design_patterns?.approved) {
  lines.push(`  ${accepted.design_patterns.approved.length} approved design patterns available`);
}

process.stdout.write(lines.join('\n') + '\n');
