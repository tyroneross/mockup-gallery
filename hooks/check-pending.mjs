import { readFileSync } from 'fs';
import { join } from 'path';

const selectionsPath = join(process.cwd(), '.mockup-gallery', 'selections.json');

let selections;
try {
  const raw = readFileSync(selectionsPath, 'utf8');
  selections = JSON.parse(raw);
} catch {
  // File doesn't exist or isn't valid JSON — stay silent
  process.exit(0);
}

const unrated = Object.values(selections).filter(
  (item) => !item.rating || item.rating === 'unrated'
).length;

if (unrated > 0) {
  process.stdout.write(
    `You have ${unrated} unrated mockup${unrated === 1 ? '' : 's'}. Run /mockup-review to continue reviewing.\n`
  );
}
