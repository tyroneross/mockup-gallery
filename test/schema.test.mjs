// Grader 1: Schema correctness
//
// Verifies the hand-rolled validators in src/lib/validate.mjs correctly
// accept known-good fixtures and reject a variety of malformed inputs.
//
// Run: node --test test/schema.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateSession,
  validateSelections,
  validateState,
  slugIsValid,
} from '../src/lib/validate.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

function goodSession(overrides = {}) {
  return {
    slug: 'icon-exploration',
    name: 'Icon Exploration',
    goal: 'Pick an icon direction',
    createdAt: '2026-04-11T22:58:42.365Z',
    updatedAt: '2026-04-11T22:58:42.365Z',
    status: 'active',
    tags: ['icons', 'branding'],
    supersededBy: null,
    decision: null,
    ...overrides,
  };
}

test('validateSession: known-good session validates clean', () => {
  const result = validateSession(goodSession());
  assert.equal(result.valid, true, `expected valid, got errors: ${result.errors.join('; ')}`);
  assert.deepEqual(result.errors, []);
});

test('validateSession: UPPERCASE slug fails', () => {
  const result = validateSession(goodSession({ slug: 'UPPERCASE' }));
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /slug/.test(e) && /pattern/.test(e)),
    `expected slug pattern error, got: ${result.errors.join('; ')}`,
  );
});

test('validateSession: slug with spaces fails', () => {
  const result = validateSession(goodSession({ slug: 'has spaces' }));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => /slug/.test(e) && /pattern/.test(e)));
});

test('validateSession: slug starting with hyphen fails', () => {
  const result = validateSession(goodSession({ slug: '-leading-hyphen' }));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => /slug/.test(e) && /pattern/.test(e)));
});

test('validateSession: missing required field (name) fails', () => {
  const bad = goodSession();
  delete bad.name;
  const result = validateSession(bad);
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /missing required property 'name'/.test(e)),
    `expected missing-name error, got: ${result.errors.join('; ')}`,
  );
});

test('validateSession: missing required field (status) fails', () => {
  const bad = goodSession();
  delete bad.status;
  const result = validateSession(bad);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => /missing required property 'status'/.test(e)));
});

test('validateSession: unknown top-level property fails (additionalProperties:false)', () => {
  const result = validateSession(goodSession({ extra: 'nope' }));
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /unknown property 'extra'/.test(e)),
    `expected unknown-property error, got: ${result.errors.join('; ')}`,
  );
});

test('validateSession: invalid status enum value fails', () => {
  const result = validateSession(goodSession({ status: 'wip' }));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => /enum/.test(e)));
});

test('validateSession: malformed createdAt date-time fails', () => {
  const result = validateSession(goodSession({ createdAt: 'not-a-date' }));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => /date-time/.test(e)));
});

test('validateSelections: fixture selections.json validates clean', () => {
  const p = join(repoRoot, 'test/fixtures/flat-unmigrated/.mockup-gallery/selections.json');
  const parsed = JSON.parse(readFileSync(p, 'utf8'));
  const result = validateSelections(parsed);
  assert.equal(result.valid, true, `fixture selections.json should validate; errors: ${result.errors.join('; ')}`);
});

test('validateSelections: missing required field (total) fails', () => {
  const bad = {
    exported: '2026-04-08T12:00:00.000Z',
    rated: 0,
    selections: [],
  };
  const result = validateSelections(bad);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => /missing required property 'total'/.test(e)));
});

test('validateState: known-good state (version 2, valid slug, migratedFrom=flat) validates', () => {
  const good = {
    version: 2,
    currentSession: 'legacy-2026-04-08',
    migratedFrom: 'flat',
    migratedAt: '2026-04-08T12:00:00.000Z',
  };
  const result = validateState(good);
  assert.equal(result.valid, true, `errors: ${result.errors.join('; ')}`);
});

test('validateState: version 1 fails const check', () => {
  const bad = {
    version: 1,
    currentSession: null,
  };
  const result = validateState(bad);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => /const/.test(e)));
});

test('validateState: invalid migratedFrom value fails', () => {
  const bad = {
    version: 2,
    currentSession: null,
    migratedFrom: 'something-else',
  };
  const result = validateState(bad);
  assert.equal(result.valid, false);
});

test('slugIsValid: table of cases', () => {
  const cases = [
    ['icon-exploration', true],
    ['legacy-2026-04-08', true],
    ['a', true],
    ['2026-04-01-dashboard', true],
    ['UPPERCASE', false],
    ['has spaces', false],
    ['-leading', false],
    ['', false],
    [null, false],
    [undefined, false],
    [123, false],
    ['trailing-', true], // pattern allows trailing hyphens
    ['under_score', false],
    ['dots.bad', false],
  ];
  for (const [input, expected] of cases) {
    assert.equal(
      slugIsValid(input),
      expected,
      `slugIsValid(${JSON.stringify(input)}) expected ${expected}`,
    );
  }
});
