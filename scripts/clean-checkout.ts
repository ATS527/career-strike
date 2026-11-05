// K-01: prove the committed revision builds and passes typecheck plus every unit and integration
// suite from a fresh clone, with nothing from this working tree (no node_modules, no dist).
// There is no hosted CI (pushing is not authorised), so this runs locally and says so.
//
//   npx tsx scripts/clean-checkout.ts
//
// Dependencies are installed with `npm ci --offline` from the local npm cache: no network.

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RegistrySchema, serializeRegistry, validateRegistry } from './registry.js';

function step(
  name: string,
  cmd: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): { name: string; command: string; exitCode: number; tail: string } {
  console.log(`== ${name}: ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  process.stdout.write(out.split('\n').slice(-15).join('\n'));
  return {
    name,
    command: `${cmd} ${args.join(' ')}`,
    exitCode: r.status ?? 1,
    tail: out
      .split('\n')
      .filter((l) => /Test Files|Tests |error|added \d+ packages/i.test(l))
      .slice(-6)
      .join('\n'),
  };
}

function main(): number {
  if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() !== '') {
    console.error('Commit first: the clean checkout must be of a committed revision.');
    return 2;
  }
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-clean-'));
  const clone = path.join(root, 'career-strike');
  execFileSync('git', ['clone', '--quiet', '--no-hardlinks', process.cwd(), clone]);
  execFileSync('git', ['checkout', '--quiet', revision], { cwd: clone });
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CAREER_STRIKE_HOME: path.join(root, 'data'),
    CAREER_STRIKE_SECRET_STORE: 'file',
  };
  delete env.CS_LIVE;

  const steps: ReturnType<typeof step>[] = [];
  for (const [name, args] of [
    ['install', ['ci', '--offline', '--no-audit', '--no-fund']],
    ['typecheck', ['run', 'typecheck']],
    ['build', ['run', 'build']],
    ['unit and integration tests', ['test']],
  ] as const) {
    const s = step(name, 'npm', [...args], clone, env);
    steps.push(s);
    if (s.exitCode !== 0) break;
  }
  const passed = steps.length === 4 && steps.every((s) => s.exitCode === 0);
  const at = new Date().toISOString();
  const evidence = {
    revision,
    at,
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    where: 'local fresh git clone (no hosted CI)',
    passed,
    steps,
  };
  const out = path.join('acceptance', 'evidence', 'ci', 'clean-checkout.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(evidence, null, 2)}\n`);

  const registry = RegistrySchema.parse(JSON.parse(fs.readFileSync('acceptance/registry.json', 'utf8')));
  const next = {
    ...registry,
    criteria: registry.criteria.map((c) =>
      c.id !== 'K-01'
        ? c
        : {
            ...c,
            tests: [out],
            status: passed ? ('PASS' as const) : ('FAIL' as const),
            failureCause: passed ? null : `${steps.at(-1)!.name} failed`,
            evidence: {
              revision,
              command: 'npx tsx scripts/clean-checkout.ts',
              exitCode: passed ? 0 : 1,
              at,
              kinds: ['ci' as const],
              notes: `Local fresh clone, ${process.version} ${process.platform}; no hosted CI`,
            },
            nextAction: passed ? 'Re-run on change' : 'Investigate the failing step in the evidence file',
          },
    ),
  };
  const problems = validateRegistry(next, fs.existsSync);
  if (problems.length) {
    console.error(problems.join('\n'));
    return 2;
  }
  fs.writeFileSync('acceptance/registry.json', serializeRegistry(next));
  fs.rmSync(root, { recursive: true, force: true });
  console.log(`\n${passed ? 'PASS' : 'FAIL'}: clean checkout of ${revision.slice(0, 12)}`);
  return passed ? 0 : 1;
}

process.exitCode = main();
