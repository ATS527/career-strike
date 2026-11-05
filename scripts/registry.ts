import { z } from 'zod';

// The acceptance registry is the single completion matrix. These rules make an
// unevidenced PASS impossible to commit.
export const EvidenceKind = z.enum(['unit', 'integration', 'e2e', 'live-source', 'real-host', 'manual', 'ci']);
export const CriterionStatus = z.enum([
  'NOT_STARTED',
  'IN_PROGRESS',
  'VERIFYING',
  'PASS',
  'FAIL',
  'FLAKY',
  'BLOCKED',
  'NOT_APPLICABLE',
]);

const Evidence = z.object({
  revision: z.string().regex(/^[0-9a-f]{40}$/),
  command: z.string().min(1),
  exitCode: z.number().int(),
  at: z.iso.datetime(),
  kinds: z.array(EvidenceKind).min(1),
  notes: z.string().optional(),
});

const Criterion = z
  .object({
    id: z.string().regex(/^[A-L]-\d{2}$/),
    behavior: z.string().min(10),
    module: z.string().min(1),
    status: CriterionStatus,
    dependsOn: z.array(z.string()),
    requiredEvidence: z.array(EvidenceKind).min(1),
    tests: z.array(z.string()),
    evidence: Evidence.nullable(),
    failureCause: z.string().nullable(),
    nextAction: z.string(),
    // Set when mapped tests pass but do not yet cover the criterion's full behaviour.
    heldBecause: z.string().min(10).optional(),
  })
  .strict();

export const RegistrySchema = z.object({ version: z.literal(1), criteria: z.array(Criterion).min(1) }).strict();

export type Registry = z.infer<typeof RegistrySchema>;
export type Criterion = z.infer<typeof Criterion>;
export type Kind = z.infer<typeof EvidenceKind>;

/** Returns a list of rule violations; empty means the registry is consistent. */
export function validateRegistry(raw: unknown, fileExists: (p: string) => boolean): string[] {
  const parsed = RegistrySchema.safeParse(raw);
  if (!parsed.success) return parsed.error.issues.map((i) => `schema: ${i.path.join('.')}: ${i.message}`);
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const c of parsed.data.criteria) {
    if (ids.has(c.id)) problems.push(`${c.id}: duplicate id`);
    ids.add(c.id);
  }
  const groups = new Set(parsed.data.criteria.map((c) => c.id[0]));
  for (const g of 'ABCDEFGHIJKL') if (!groups.has(g)) problems.push(`group ${g}: no criteria`);
  for (const c of parsed.data.criteria) {
    for (const dep of c.dependsOn) {
      if (dep === c.id) problems.push(`${c.id}: depends on itself`);
      else if (!ids.has(dep)) problems.push(`${c.id}: depends on unknown ${dep}`);
    }
    if (c.status === 'PASS') {
      if (c.heldBecause) problems.push(`${c.id}: PASS while held (${c.heldBecause})`);
      if (!c.evidence) problems.push(`${c.id}: PASS without evidence`);
      else {
        if (c.evidence.exitCode !== 0) problems.push(`${c.id}: PASS with non-zero evidence exit code`);
        for (const kind of c.requiredEvidence) {
          if (!c.evidence.kinds.includes(kind)) problems.push(`${c.id}: PASS lacks ${kind} evidence`);
        }
      }
    }
    if (['FAIL', 'FLAKY', 'BLOCKED'].includes(c.status) && !c.failureCause)
      problems.push(`${c.id}: ${c.status} without failure cause`);
    if (c.status !== 'NOT_STARTED' && c.status !== 'NOT_APPLICABLE') {
      for (const t of c.tests) if (!fileExists(t)) problems.push(`${c.id}: missing test file ${t}`);
    }
  }
  return problems;
}

/** Evidence kind produced by a passing test file, from its location. */
export function kindOfTestFile(file: string): Kind | null {
  if (file.startsWith('test/unit/')) return 'unit';
  if (file.startsWith('test/integration/') || file.startsWith('test/security/')) return 'integration';
  if (file.startsWith('test/e2e/')) return 'e2e';
  if (file.startsWith('test/live/')) return 'live-source';
  return null;
}

/** One criterion per line: readable diffs when evidence changes. */
export function serializeRegistry(registry: Registry): string {
  const lines = registry.criteria.map((c) => `    ${JSON.stringify(c)}`);
  return `{\n  "version": ${registry.version},\n  "criteria": [\n${lines.join(',\n')}\n  ]\n}\n`;
}
