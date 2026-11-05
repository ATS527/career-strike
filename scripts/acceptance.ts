// Runs the tests mapped to acceptance criteria and records evidence in acceptance/registry.json.
// Evidence is only meaningful for committed code, so the working tree must be clean.
//
//   npm run acceptance              # every criterion that lists tests
//   npm run acceptance -- A-01 A-03 # selected criteria
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  type Criterion,
  type Kind,
  kindOfTestFile,
  type Registry,
  RegistrySchema,
  serializeRegistry,
  validateRegistry,
} from './registry.js';

const REGISTRY = 'acceptance/registry.json';

interface FileResult {
  name: string;
  status: string;
  assertionResults: { fullName: string; status: string; failureMessages?: string[] }[];
}

interface PlaywrightSuite {
  file?: string;
  title: string;
  specs?: { title: string; ok: boolean; tests?: { status?: string; results?: { error?: { message?: string } }[] }[] }[];
  suites?: PlaywrightSuite[];
}

/** Flatten Playwright's JSON report into per-file results shaped like Vitest's. */
function playwrightResults(suites: PlaywrightSuite[]): FileResult[] {
  const byFile = new Map<string, FileResult>();
  const visit = (suite: PlaywrightSuite, file: string | undefined): void => {
    const f = suite.file ?? file;
    for (const spec of suite.specs ?? []) {
      if (!f) continue;
      const entry = byFile.get(f) ?? { name: path.resolve('test/e2e', f), status: 'passed', assertionResults: [] };
      // A skipped test proved nothing: it never counts as evidence.
      const skipped = (spec.tests ?? []).every((t) => t.status === 'skipped');
      const errors = (spec.tests ?? []).flatMap((t) =>
        (t.results ?? []).map((r) => r.error?.message).filter((m): m is string => !!m),
      );
      entry.assertionResults.push({
        fullName: spec.title,
        status: skipped ? 'skipped' : spec.ok ? 'passed' : 'failed',
        failureMessages: errors,
      });
      byFile.set(f, entry);
    }
    for (const child of suite.suites ?? []) visit(child, f);
  };
  for (const s of suites) visit(s, undefined);
  // A file is evidence only if something in it really ran and passed, and nothing failed.
  for (const entry of byFile.values()) {
    const statuses = entry.assertionResults.map((a) => a.status);
    entry.status = statuses.includes('failed') ? 'failed' : statuses.includes('passed') ? 'passed' : 'skipped';
  }
  return [...byFile.values()];
}

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function main(): number {
  if (git('status', '--porcelain') !== '') {
    console.error('Refusing to record evidence: commit or stash changes first so evidence maps to a real revision.');
    return 2;
  }
  const revision = git('rev-parse', 'HEAD');
  const registry = RegistrySchema.parse(JSON.parse(fs.readFileSync(REGISTRY, 'utf8')));
  const requested = new Set(process.argv.slice(2));
  // Criteria whose evidence comes from certification scripts (real hosts) are not re-run here.
  const selected = registry.criteria.filter(
    (c) =>
      c.tests.length > 0 &&
      c.tests.every((t) => kindOfTestFile(t) !== null) &&
      c.status !== 'NOT_APPLICABLE' &&
      (requested.size === 0 || requested.has(c.id)),
  );
  const unknown = [...requested].filter((id) => !registry.criteria.some((c) => c.id === id));
  if (unknown.length > 0) {
    console.error(`Unknown criteria: ${unknown.join(', ')}`);
    return 2;
  }

  const files = [...new Set(selected.flatMap((c) => c.tests))];
  const vitestFiles = files.filter((f) => kindOfTestFile(f) !== 'e2e');
  const e2eFiles = files.filter((f) => kindOfTestFile(f) === 'e2e');
  const results = new Map<string, FileResult>();
  const commands: string[] = [];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-acceptance-'));
  if (vitestFiles.length > 0) {
    const out = path.join(tmp, 'vitest.json');
    commands.push(`vitest run ${vitestFiles.join(' ')}`);
    const live = vitestFiles.some((f) => kindOfTestFile(f) === 'live-source');
    spawnSync('npx', ['vitest', 'run', '--reporter=json', `--outputFile=${out}`, ...vitestFiles], {
      stdio: 'inherit',
      env: { ...process.env, ...(live ? { CS_LIVE: '1' } : {}) },
    });
    const report = JSON.parse(fs.readFileSync(out, 'utf8')) as { testResults: FileResult[] };
    for (const r of report.testResults) results.set(path.relative(process.cwd(), r.name), r);
  }
  if (e2eFiles.length > 0) {
    // E2E evidence must come from the build of this exact revision.
    const build = spawnSync('npm', ['run', 'build'], { stdio: 'inherit' });
    if (build.status !== 0) {
      console.error('Build failed; no e2e evidence recorded.');
      return 1;
    }
    commands.push(`playwright test ${e2eFiles.join(' ')}`);
    // Live journeys reach real public job boards (read-only), so they run only when listed.
    const liveE2e = e2eFiles.some((f) => path.basename(f) === 'live.spec.ts');
    const run = spawnSync('npx', ['playwright', 'test', '--reporter=json', ...e2eFiles], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, ...(liveE2e ? { CS_LIVE: '1' } : {}) },
    });
    const report = JSON.parse(run.stdout) as { suites: PlaywrightSuite[] };
    for (const r of playwrightResults(report.suites)) results.set(path.relative(process.cwd(), r.name), r);
  }
  const command = commands.join(' && ');

  const at = new Date().toISOString();
  let failures = 0;
  const updated = registry.criteria.map((c): Criterion => {
    if (!selected.includes(c)) return c;
    const missing = c.tests.filter((t) => !results.has(t));
    const failed = c.tests.map((t) => results.get(t)).filter((r) => r !== undefined && r.status !== 'passed');
    if (missing.length > 0 || failed.length > 0) {
      failures += 1;
      const first = failed[0]?.assertionResults.find((a) => a.status === 'failed');
      // Keep the first line of the error so a failure can be diagnosed from the registry alone.
      const reason = (first?.failureMessages?.[0] ?? '')
        .replace(/\u001b\[[0-9;]*m/g, '')
        .split('\n')
        .find((l) => l.trim() !== '')
        ?.trim()
        .slice(0, 240);
      const cause =
        missing.length > 0
          ? `No result for ${missing.join(', ')}`
          : `${path.relative(process.cwd(), failed[0]!.name)}: ${first?.fullName ?? 'file failed'}${reason ? ` — ${reason}` : ''}`;
      return {
        ...c,
        status: 'FAIL',
        failureCause: cause,
        evidence: { revision, command, exitCode: 1, at, kinds: kindsOf(c.tests) },
      };
    }
    const kinds = kindsOf(c.tests);
    if (c.requiredEvidence.includes('manual') && c.evidence?.kinds.includes('manual')) {
      kinds.push('manual');
    }
    const lacking = c.requiredEvidence.filter((k) => !kinds.includes(k));
    const evidence = {
      revision,
      command,
      exitCode: 0,
      at,
      kinds,
      ...(c.evidence?.notes ? { notes: c.evidence.notes } : {}),
    };
    if (lacking.length > 0) {
      return {
        ...c,
        status: 'IN_PROGRESS',
        failureCause: null,
        evidence,
        nextAction: `Needs ${lacking.join(', ')} evidence`,
      };
    }
    if (c.heldBecause) return { ...c, status: 'IN_PROGRESS', failureCause: null, evidence };
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
  for (const c of updated.filter((x) => selectedIds.has(x.id)))
    console.log(`${c.status.padEnd(12)} ${c.id}  ${c.failureCause ?? ''}`);
  console.log(`Evidence recorded at ${revision.slice(0, 12)}.`);
  return failures > 0 ? 1 : 0;
}

function kindsOf(tests: string[]): Kind[] {
  return [...new Set(tests.map(kindOfTestFile).filter((k): k is Kind => k !== null))];
}

process.exitCode = main();
