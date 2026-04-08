#!/usr/bin/env node
/**
 * Reads COMMON.md, CLAUDE.md, and AGENTS.md from the plugin root.
 * Extracts section headings and key terms from COMMON.md,
 * checks whether each platform doc references them.
 * Outputs a structured drift report.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const root = process.env.CLAUDE_PLUGIN_ROOT || process.argv[2] || process.cwd();

const commonPath = join(root, 'COMMON.md');
const claudePath = join(root, 'CLAUDE.md');
const agentsPath = join(root, 'AGENTS.md');

function readFile(p) {
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf8');
}

const common = readFile(commonPath);
const claude = readFile(claudePath);
const agents = readFile(agentsPath);

if (!common) {
  console.error('COMMON.md not found at ' + commonPath);
  process.exit(1);
}

const gaps = [];

// Extract ## headings from COMMON.md as key sections
const sections = [];
for (const line of common.split('\n')) {
  const match = line.match(/^##\s+(.+)/);
  if (match) sections.push(match[1].trim());
}

// Extract key terms: JSON filenames, rating values, behavioral rule keywords
const keyTerms = [
  'selections.json', 'selected.json', 'implemented.json', 'accepted-designs.json',
  'yay', 'nay', 'unrated',
  'data-component',
  'changeNote',
  'COMMON.md'
];

// Check each platform doc
for (const [name, content] of [['CLAUDE.md', claude], ['AGENTS.md', agents]]) {
  if (!content) {
    gaps.push({ doc: name, issue: 'File missing', section: 'all' });
    continue;
  }

  // Check COMMON.md reference
  if (!content.includes('COMMON.md')) {
    gaps.push({ doc: name, issue: 'Does not reference COMMON.md', section: 'header' });
  }

  // Check key terms coverage
  for (const term of keyTerms) {
    if (common.includes(term) && !content.includes(term)) {
      // Not every term needs to be in platform docs — only flag data file names
      if (term.endsWith('.json')) {
        gaps.push({ doc: name, issue: `No mention of "${term}"`, section: 'Data Schema' });
      }
    }
  }
}

// Cross-check: terms in one platform doc but not the other
if (claude && agents) {
  for (const term of keyTerms) {
    const inClaude = claude.includes(term);
    const inAgents = agents.includes(term);
    if (inClaude && !inAgents) {
      gaps.push({ doc: 'AGENTS.md', issue: `CLAUDE.md mentions "${term}" but AGENTS.md does not`, section: 'cross-check' });
    }
    if (inAgents && !inClaude) {
      gaps.push({ doc: 'CLAUDE.md', issue: `AGENTS.md mentions "${term}" but CLAUDE.md does not`, section: 'cross-check' });
    }
  }
}

// Output
if (gaps.length === 0) {
  console.log('All docs aligned. No drift detected.');
} else {
  console.log(`Found ${gaps.length} alignment gap(s):\n`);
  for (const gap of gaps) {
    console.log(`  [${gap.doc}] ${gap.issue}`);
    console.log(`    Section: ${gap.section}`);
    console.log('');
  }
  console.log('Review each gap and update the relevant doc. COMMON.md is the source of truth.');
}
