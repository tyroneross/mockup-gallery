/**
 * PostToolUse hook — fires after Write/Edit on mockup HTML files.
 * Checks if gallery has pending feedback to surface.
 *
 * Also checks selections.json for any feedback that hasn't been
 * shared via the button (passive check — doesn't require user
 * to click "Share with Claude").
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Read hook input from stdin
let input = '';
try {
  input = readFileSync('/dev/stdin', 'utf8');
} catch { process.exit(0); }

let parsed;
try { parsed = JSON.parse(input); } catch { process.exit(0); }

const toolName = parsed.tool_name;
const filePath = parsed.tool_input?.file_path || parsed.tool_input?.command || '';

// Only trigger on Write/Edit to mockup HTML files
if (!['Write', 'Edit'].includes(toolName)) process.exit(0);
if (!filePath.includes('mockup') || !filePath.endsWith('.html')) process.exit(0);

// Check for pending-review.json first (shared via button)
const pendingPath = join(process.cwd(), '.mockup-gallery', 'pending-review.json');
if (existsSync(pendingPath)) {
  // Let the UserPromptSubmit hook handle this — just nudge
  process.stdout.write(
    '[Mockup Gallery] There is pending feedback from the gallery. ' +
    'It will be shown on your next message, or run /mockup-feedback to see it now.\n'
  );
  process.exit(0);
}

// Passive check — read selections.json for unacted feedback
const selectionsPath = join(process.cwd(), '.mockup-gallery', 'selections.json');
if (!existsSync(selectionsPath)) process.exit(0);

let selections;
try { selections = JSON.parse(readFileSync(selectionsPath, 'utf8')); } catch { process.exit(0); }

const items = Array.isArray(selections.selections) ? selections.selections : [];
if (items.length === 0) process.exit(0);

// Find feedback relevant to the file just edited
const editedName = filePath.split('/').pop().replace('.html', '');
const relevant = items.find(i =>
  (i.file || '').replace('.html', '') === editedName
);

if (!relevant) process.exit(0);

// Surface relevant feedback for the mockup that was just edited
const lines = [];
lines.push(`[Mockup Gallery] Feedback for "${relevant.name || editedName}":`);
lines.push(`  Rating: ${relevant.rating || 'unrated'}`);

if (relevant.note) {
  lines.push(`  Note: "${relevant.note}"`);
}

for (const comp of (relevant.components || [])) {
  if (comp.name && comp.name.length > 30) {
    lines.push(`  Comment: "${comp.name}"`);
  }
  if (comp.note) {
    lines.push(`  ${comp.name}: "${comp.note}"`);
  }
}

if (lines.length > 1) {
  process.stdout.write(lines.join('\n') + '\n');
}
