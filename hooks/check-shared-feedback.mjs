import { readFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';

const pendingPath = join(process.cwd(), '.mockup-gallery', 'pending-review.json');

if (!existsSync(pendingPath)) process.exit(0);

let data;
try {
  data = JSON.parse(readFileSync(pendingPath, 'utf8'));
} catch {
  process.exit(0);
}

// Delete after reading — one-shot
try { unlinkSync(pendingPath); } catch { /* ignore */ }

const lines = [];
lines.push('[Mockup Gallery] New feedback from design review:');
lines.push('');

// Ratings section — data.ratings is an array of { mockup, rating, note, comments }
const ratings = Array.isArray(data.ratings) ? data.ratings : [];

if (ratings.length > 0) {
  lines.push('Ratings:');
  for (const item of ratings) {
    const name = item.mockup || 'unknown';
    const rating = item.rating || 'unrated';
    const parts = [`  ${name}: ${rating}`];
    if (item.note) parts.push(` — "${item.note}"`);
    lines.push(parts.join(''));
    // Show comments (component-level feedback)
    if (item.comments && item.comments.length > 0) {
      for (const comment of item.comments) {
        lines.push(`    Comment: "${comment}"`);
      }
    }
  }
}

// Selected for build — data.selections is { route: { mockup, note } }
const selections = data.selections || {};
const selectedEntries = Object.entries(selections);

if (selectedEntries.length > 0) {
  lines.push('');
  lines.push('Selected for build:');
  for (const [route, info] of selectedEntries) {
    const mockup = typeof info === 'string' ? info : (info.mockup || info.source || 'unknown');
    lines.push(`  ${route} \u2190 ${mockup}`);
    if (info.note) lines.push(`    Note: ${info.note}`);
  }
}

// Use pre-built summary if available, otherwise compute
if (data.summary) {
  lines.push('');
  lines.push(`Summary: ${data.summary}`);
} else {
  const yay = ratings.filter(r => r.rating === 'yay').length;
  const nay = ratings.filter(r => r.rating === 'nay').length;
  const unrated = ratings.filter(r => r.rating !== 'yay' && r.rating !== 'nay').length;
  lines.push('');
  lines.push(`Summary: ${ratings.length} rated (${yay} yay, ${nay} nay, ${unrated} unrated), ${selectedEntries.length} page(s) selected`);
}

lines.push('');
lines.push('To act on this feedback, iterate on the mockups or implement the selected designs.');

process.stdout.write(lines.join('\n') + '\n');
