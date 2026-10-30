import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

// Spec section 13 lists the browser journeys that must pass against the real service. Each is
// mapped to Playwright tests in acceptance/journeys.json; this keeps the map honest.
const REQUIRED = [
  'First launch', 'Onboarding', 'Settings persistence', 'Job intake', 'Live job-source retrieval', 'Job verification', 'Search and filtering',
  'Shortlisting', 'Job comparison', 'Draft creation', 'Draft editing', 'Exact approval', 'Approval invalidation after edits', 'Rejection',
  'Controlled submission', 'Confirmation receipt', 'Application tracking', 'Follow-up creation', 'Interview preparation', 'Agent activity display',
  'Task cancellation', 'Error recovery', 'Responsive layout', 'Keyboard navigation', 'Accessibility checks',
];

const map = JSON.parse(fs.readFileSync('acceptance/journeys.json', 'utf8')) as { journeys: { journey: string; tests: { file: string; title: string }[] }[] };
const registry = JSON.parse(fs.readFileSync('acceptance/registry.json', 'utf8')) as { criteria: { id: string; tests: string[] }[] };

describe('required browser journeys', () => {
  it('every journey in the spec is mapped to at least one test, and nothing else is', () => {
    expect(map.journeys.map((j) => j.journey)).toEqual(REQUIRED);
    for (const j of map.journeys) expect(j.tests.length, j.journey).toBeGreaterThan(0);
  });

  it('every mapped test exists by its exact title and is not skipped unconditionally', () => {
    for (const { journey, tests } of map.journeys) {
      for (const t of tests) {
        expect(fs.existsSync(t.file), `${journey}: ${t.file}`).toBe(true);
        const source = fs.readFileSync(t.file, 'utf8');
        expect(source.includes(`test('${t.title}'`) || source.includes(`test(\`${t.title}\``), `${journey}: "${t.title}" in ${t.file}`).toBe(true);
        expect(source, t.file).not.toMatch(/test\.(skip|fixme)\(\s*['`]/);
      }
    }
  });

  it('K-05 runs every file the journeys depend on', () => {
    const k05 = registry.criteria.find((c) => c.id === 'K-05')!;
    const files = new Set(map.journeys.flatMap((j) => j.tests.map((t) => t.file)));
    for (const f of files) expect(k05.tests, f).toContain(f);
  });
});
