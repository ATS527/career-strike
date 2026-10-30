import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { kindOfTestFile, validateRegistry } from '../../scripts/registry.js';

const real = JSON.parse(fs.readFileSync('acceptance/registry.json', 'utf8')) as { version: 1; criteria: Record<string, unknown>[] };

// Patches start from a neutral state so the fixtures do not depend on live registry evidence.
function withCriterion(patch: Record<string, unknown>) {
  const neutral = { status: 'NOT_STARTED', evidence: null, failureCause: null };
  const criteria = real.criteria.map((c) => (c.id === 'A-02' ? { ...c, ...neutral, ...patch } : c));
  return { ...real, criteria };
}

const goodEvidence = {
  revision: 'a'.repeat(40),
  command: 'npm run acceptance',
  exitCode: 0,
  at: '2026-10-30T10:00:00.000Z',
  kinds: ['integration'],
};

describe('acceptance registry', () => {
  it('the committed registry satisfies every rule', () => {
    expect(validateRegistry(real, fs.existsSync)).toEqual([]);
  });

  it('rejects PASS without evidence', () => {
    expect(validateRegistry(withCriterion({ status: 'PASS' }), () => true)).toContain('A-02: PASS without evidence');
  });

  it('rejects PASS whose evidence does not cover the required kinds', () => {
    const problems = validateRegistry(withCriterion({ status: 'PASS', evidence: { ...goodEvidence, kinds: ['unit'] } }), () => true);
    expect(problems).toContain('A-02: PASS lacks integration evidence');
  });

  it('rejects PASS with a failing exit code', () => {
    const problems = validateRegistry(withCriterion({ status: 'PASS', evidence: { ...goodEvidence, exitCode: 1 } }), () => true);
    expect(problems).toContain('A-02: PASS with non-zero evidence exit code');
  });

  it('rejects PASS for a criterion held back for incomplete scope', () => {
    const problems = validateRegistry(withCriterion({ status: 'PASS', evidence: goodEvidence, heldBecause: 'Counts arrive in Phase 3' }), () => true);
    expect(problems).toContain('A-02: PASS while held (Counts arrive in Phase 3)');
  });

  it('accepts PASS with complete successful evidence', () => {
    expect(validateRegistry(withCriterion({ status: 'PASS', evidence: goodEvidence }), () => true)).toEqual([]);
  });

  it('rejects mocked evidence standing in for a real host', () => {
    const criteria = real.criteria.map((c) =>
      c.id === 'G-03' ? { ...c, status: 'PASS', failureCause: null, evidence: { ...goodEvidence, kinds: ['unit', 'integration'] } } : c,
    );
    expect(validateRegistry({ ...real, criteria }, () => true)).toContain('G-03: PASS lacks real-host evidence');
  });

  it('requires a cause for BLOCKED and rejects unknown dependencies and duplicate ids', () => {
    expect(validateRegistry(withCriterion({ status: 'BLOCKED' }), () => true)).toContain('A-02: BLOCKED without failure cause');
    expect(validateRegistry(withCriterion({ dependsOn: ['Z-99'] }), () => true)).toContain('A-02: depends on unknown Z-99');
    const dup = { ...real, criteria: [...real.criteria, real.criteria[0]] };
    expect(validateRegistry(dup, () => true)).toContain('A-01: duplicate id');
  });

  it('rejects started criteria whose test files are missing', () => {
    expect(validateRegistry(withCriterion({ status: 'IN_PROGRESS' }), () => false)).toContain(
      'A-02: missing test file test/integration/store.test.ts',
    );
  });

  it('maps test locations to evidence kinds', () => {
    expect(kindOfTestFile('test/unit/x.test.ts')).toBe('unit');
    expect(kindOfTestFile('test/integration/x.test.ts')).toBe('integration');
    expect(kindOfTestFile('test/live/x.test.ts')).toBe('live-source');
    expect(kindOfTestFile('docs/x.md')).toBeNull();
  });
});
