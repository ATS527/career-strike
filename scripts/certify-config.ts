// G-07: connect/disconnect change only Career Strike's entry in each host's configuration and are
// fully reversible. Needs no model calls, so it runs even when a host's account is rate-limited.
//
//   npm run build && npx tsx scripts/certify-config.ts
import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual, promisify } from 'node:util';
import { parse } from 'jsonc-parser';
import { HOSTS, type Host, hostVersion, opencodeConfigFile, settlesTo } from '../src/mcp/hosts.js';
import { RegistrySchema, serializeRegistry, validateRegistry } from './registry.js';

const run = promisify(execFile);
const CLI = path.resolve('dist/cli/index.js');

/** The part of each host's configuration that holds MCP servers, as parsed data. */
function mcpSection(host: Host): unknown {
  switch (host) {
    case 'codex': {
      // TOML: compare the whole file text; codex rewrites only what `mcp add/remove` touches.
      const file = path.join(os.homedir(), '.codex', 'config.toml');
      return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    }
    case 'claude-code': {
      // ~/.claude.json also holds Claude's own changing state; compare only user-scope MCP servers.
      const file = path.join(os.homedir(), '.claude.json');
      return fs.existsSync(file)
        ? ((JSON.parse(fs.readFileSync(file, 'utf8')) as { mcpServers?: unknown }).mcpServers ?? null)
        : null;
    }
    case 'opencode': {
      const file = opencodeConfigFile();
      return file ? parse(fs.readFileSync(file, 'utf8')) : null;
    }
  }
}

async function main(): Promise<number> {
  if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() !== '') {
    console.error('Commit first.');
    return 2;
  }
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-cert-config-'));
  const env = { ...process.env, CAREER_STRIKE_HOME: path.join(root, 'data'), CAREER_STRIKE_SECRET_STORE: 'file' };
  const results: { host: Host; version: string | null; checks: { name: string; passed: boolean; detail: string }[] }[] =
    [];
  try {
    await run(process.execPath, [CLI, 'init'], { env });
    for (const host of HOSTS) {
      const version = await hostVersion(host);
      const checks: { name: string; passed: boolean; detail: string }[] = [];
      const before = mcpSection(host);
      await run(process.execPath, [CLI, 'connect', host], { env, timeout: 120_000 });
      checks.push({ name: 'listed after connect', passed: await settlesTo(host, true), detail: `${host} mcp list` });
      const during = JSON.stringify(mcpSection(host));
      checks.push({
        name: 'config holds a command, no token',
        passed: during.includes('career-strike') && !/csm_[A-Za-z0-9_-]{20,}/.test(during),
        detail: 'no MCP token in host config',
      });
      await run(process.execPath, [CLI, 'disconnect', host], { env, timeout: 120_000 }).catch(() => undefined);
      checks.push({
        name: 'not listed after disconnect',
        passed: await settlesTo(host, false),
        detail: `${host} mcp list`,
      });
      checks.push({
        name: 'configuration identical to before',
        passed: isDeepStrictEqual(before, mcpSection(host)),
        detail: 'MCP section compared before connect and after disconnect',
      });
      for (const c of checks) console.log(`${c.passed ? 'PASS' : 'FAIL'}  ${host}: ${c.name}`);
      results.push({ host, version, checks });
    }
  } finally {
    for (const host of HOSTS)
      if (await settlesTo(host, false, 1).then((x) => !x))
        await run(process.execPath, [CLI, 'disconnect', host], { env }).catch(() => undefined);
    await run(process.execPath, [CLI, 'stop'], { env }).catch(() => undefined);
    fs.rmSync(root, { recursive: true, force: true });
  }

  const passed = results.length === HOSTS.length && results.every((r) => r.checks.every((c) => c.passed));
  const out = path.join('acceptance', 'evidence', 'real-host', 'config-roundtrip.json');
  const at = new Date().toISOString();
  fs.writeFileSync(out, `${JSON.stringify({ revision, at, passed, results }, null, 2)}\n`);
  const registry = RegistrySchema.parse(JSON.parse(fs.readFileSync('acceptance/registry.json', 'utf8')));
  const next = {
    ...registry,
    criteria: registry.criteria.map((c) =>
      c.id !== 'G-07'
        ? c
        : {
            ...c,
            tests: [out],
            status: passed ? ('PASS' as const) : ('FAIL' as const),
            failureCause: passed ? null : 'See config-roundtrip.json',
            evidence: {
              revision,
              command: 'npx tsx scripts/certify-config.ts',
              exitCode: passed ? 0 : 1,
              at,
              kinds: ['real-host' as const],
              notes: results.map((r) => `${r.host} ${r.version}`).join('; '),
            },
            nextAction: passed ? 'Re-run when host CLIs change' : 'Investigate',
          },
    ),
  };
  const problems = validateRegistry(next, fs.existsSync);
  if (problems.length) {
    console.error(problems.join('\n'));
    return 2;
  }
  fs.writeFileSync('acceptance/registry.json', serializeRegistry(next));
  console.log(passed ? 'G-07 PASS' : 'G-07 FAIL');
  return passed ? 0 : 1;
}

process.exitCode = await main();
