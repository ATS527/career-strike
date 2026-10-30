// Runs the tests mapped to acceptance criteria and records evidence in acceptance/registry.json.
// Evidence is only meaningful for committed code, so the working tree must be clean.
//
//   npm run acceptance              # every criterion that lists tests
//   npm run acceptance -- A-01 A-03 # selected criteria
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { type Criterion, type Kind, kindOfTestFile, type Registry, RegistrySchema, validateRegistry } from './registry.js';

const REGISTRY = 'acceptance/registry.json';

interface VitestFileResult {
  name: string;
  status: string;
  assertionResults: { fullName: string; status: string }[];
}

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

export function serializeRegistry(registry: Registry): string {
  const lines = registry.criteria.map((c) => `    ${JSON.stringify(c)}`);
  return `{\n  "version": ${registry.version},\n  "criteria": [\n${lines.join(',\n')}\n  ]\n}\n`;
}

function main(): number {
  if (git('status', '--porcelain') !== '') {
    console.error('Refusing to record evidence: commit or stash changes first so evidence maps to a real revision.');
    return 2;
  }
  const revision = git('rev-parse', 'HEAD');
  const registry = RegistrySchema.parse(JSON.parse(fs.readFileSync(REGISTRY, 'utf8')));
  const requested = new Set(process.argv.slice(2));
  const selected = registry.criteria.filter(
    (c) => c.tests.length > 0 && c.status !== 'NOT_APPLICABLE' && (requested.size === 0 || requested.has(c.id)),
  );
  const unknown = [...requested].filter((id) => !registry.criteria.some((c) => c.id === id));
  if (unknown.length > 0) {
    console.error(`Unknown criteria: ${unknown.join(', ')}`);
    return 2;
  }

  const files = [...new Set(selected.flatMap((c) => c.tests))];
  const vitestFiles = files.filter((f) => kindOfTestFile(f) !== 'e2e');
  const results = new Map<string, VitestFileResult>();
  const command = `vitest run ${vitestFiles.join(' ')}`;
  if (vitestFiles.length > 0) {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cs-acceptance-')), 'vitest.json');
    spawnSync('npx', ['vitest', 'run', '--reporter=json', `--outputFile=${out}`, ...vitestFiles], { stdio: 'inherit' });
    const report = JSON.parse(fs.readFileSync(out, 'utf8')) as { testResults: VitestFileResult[] };
    for (const r of report.testResults) results.set(path.relative(process.cwd(), r.name), r);
  }

  const at = new Date().toISOString();
  let failures = 0;
  const updated = registry.criteria.map((c): Criterion => {
    if (!selected.includes(c)) return c;
    const missing = c.tests.filter((t) => !results.has(t));
    const failed = c.tests.map((t) => results.get(t)).filter((r) => r !== undefined && r.status !== 'passed');
    if (missing.length > 0 || failed.length > 0) {
      failures += 1;
      const firstFailure = failed[0]?.assertionResults.find((a) => a.status === 'failed')?.fullName;
      const cause = missing.length > 0 ? `No result for ${missing.join(', ')}` : `${path.relative(process.cwd(), failed[0]!.name)}: ${firstFailure ?? 'file failed'}`;
      return { ...c, status: 'FAIL', failureCause: cause, evidence: { revision, command, exitCode: 1, at, kinds: kindsOf(c.tests) } };
    }
    const kinds = kindsOf(c.tests);
    const lacking = c.requiredEvidence.filter((k) => !kinds.includes(k));
    const evidence = { revision, command, exitCode: 0, at, kinds };
    if (lacking.length > 0) {
      return { ...c, status: 'IN_PROGRESS', failureCause: null, evidence, nextAction: `Needs ${lacking.join(', ')} evidence` };
    }
    return { ...c, status: 'PASS', failureCause: null, evidence, nextAction: 'Re-verify on change' };
  });

  const next: Registry = { ...registry, criteria: updated };
  const problems = validateRegistry(next, fs.existsSync);
  if (problems.length > 0) {
    console.error(`Registry would become inconsistent:\n${problems.join('\n')}`);
    return 2;
  }
  fs.writeFileSync(REGISTRY, serializeRegistry(next));
  const selectedIds = new Set(selected.map((c) => c.id));
  for (const c of updated.filter((x) => selectedIds.has(x.id))) console.log(`${c.status.padEnd(12)} ${c.id}  ${c.failureCause ?? ''}`);
  console.log(`Evidence recorded at ${revision.slice(0, 12)}.`);
  return failures > 0 ? 1 : 0;
}

function kindsOf(tests: string[]): Kind[] {
  return [...new Set(tests.map(kindOfTestFile).filter((k): k is Kind => k !== null))];
}

process.exitCode = main();
