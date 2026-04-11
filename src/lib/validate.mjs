// Minimal hand-rolled JSON Schema (draft-07 subset) validator.
// Supports only the features used by the three mockup-gallery schemas:
// type, required, properties, additionalProperties:false, enum, const,
// pattern, minLength, maxLength, minimum, items, oneOf, format:date-time.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const schemaDir = join(here, '..', 'schemas');
const load = (f) => JSON.parse(readFileSync(join(schemaDir, f), 'utf8'));

const sessionSchema = load('session.schema.json');
const selectionsSchema = load('selections.schema.json');
const stateSchema = load('state.schema.json');

const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

const jsType = (v) => {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v;
};

const typeMatches = (schemaType, v) => {
  const actual = jsType(v);
  const types = Array.isArray(schemaType) ? schemaType : [schemaType];
  for (const t of types) {
    if (t === 'number' && (actual === 'number' || actual === 'integer')) return true;
    if (t === actual) return true;
  }
  return false;
};

function walk(schema, value, path, errors) {
  if (schema.oneOf) {
    const subErrors = [];
    let passed = 0;
    for (const sub of schema.oneOf) {
      const e = [];
      walk(sub, value, path, e);
      if (e.length === 0) passed++;
      else subErrors.push(e);
    }
    if (passed !== 1) errors.push(`${path}: did not match exactly one of oneOf (matched ${passed})`);
    return;
  }

  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${path}: expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
  }

  if (schema.type && !typeMatches(schema.type, value)) {
    errors.push(`${path}: expected type ${JSON.stringify(schema.type)}, got ${jsType(value)}`);
    return;
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: value ${JSON.stringify(value)} not in enum ${JSON.stringify(schema.enum)}`);
  }

  if (typeof value === 'string') {
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path}: string does not match pattern ${schema.pattern}`);
    }
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path}: string shorter than minLength ${schema.minLength}`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(`${path}: string longer than maxLength ${schema.maxLength}`);
    }
    if (schema.format === 'date-time' && !DATE_TIME_RE.test(value)) {
      errors.push(`${path}: string is not a valid date-time`);
    }
  }

  if (typeof value === 'number' && schema.minimum !== undefined && value < schema.minimum) {
    errors.push(`${path}: number below minimum ${schema.minimum}`);
  }

  if (Array.isArray(value) && schema.items) {
    value.forEach((item, i) => walk(schema.items, item, `${path}[${i}]`, errors));
  }

  if (jsType(value) === 'object' && schema.type === 'object') {
    for (const req of schema.required || []) {
      if (!(req in value)) errors.push(`${path}: missing required property '${req}'`);
    }
    const props = schema.properties || {};
    for (const [k, v] of Object.entries(value)) {
      if (props[k]) walk(props[k], v, `${path}.${k}`, errors);
      else if (schema.additionalProperties === false) {
        errors.push(`${path}: unknown property '${k}'`);
      }
    }
  }
}

function validate(schema, obj) {
  const errors = [];
  walk(schema, obj, '$', errors);
  return { valid: errors.length === 0, errors };
}

export const validateSession = (obj) => validate(sessionSchema, obj);
export const validateSelections = (obj) => validate(selectionsSchema, obj);
export const validateState = (obj) => validate(stateSchema, obj);

export const slugIsValid = (s) =>
  typeof s === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(s);

if (import.meta.url === `file://${process.argv[1]}`) {
  const good = {
    slug: 'icon-exploration',
    name: 'Icon Exploration',
    createdAt: '2026-04-11T22:58:42.365Z',
    updatedAt: '2026-04-11T22:58:42.365Z',
    status: 'active',
    tags: ['icons', 'branding'],
    supersededBy: null,
    decision: null,
  };
  const bad = {
    slug: 'Bad Slug!',
    name: '',
    createdAt: 'not-a-date',
    updatedAt: '2026-04-11T22:58:42.365Z',
    status: 'wip',
    extra: 'nope',
  };
  const g = validateSession(good);
  const b = validateSession(bad);
  console.log('good:', g);
  console.log('bad:', b);
  if (!g.valid || b.valid) {
    console.error('self-test FAILED');
    process.exit(1);
  }
  console.log('self-test OK');
  process.exit(0);
}
