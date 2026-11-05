// End-to-end rehearsal of `career-strike update` with real packages, a real npm install and a
// real service, against a fake GitHub on loopback. Nothing outside temporary folders is touched.
//
//   npm run test:update
//
// 1. Build, then pack this tree twice: as its own version (A) and as the next patch (B).
// 2. Install A into a temporary npm prefix, create data, start the service on a free port.
// 3. `career-strike update --yes` must move to B, keep the data and restart on the same port.
// 4. `career-strike update --undo --yes` must return to A with the data intact.

import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { appPaths } from '../src/core/paths.js';
import { openDb } from '../src/store/db.js';
import { getSettings, setSetting } from '../src/store/settings.js';
import { parseVersion } from '../src/updates/version.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
  version: string;
  files: string[];
};
const A = pkg.version;
const B = (() => {
  const v = parseVersion(A)!;
  return `${v[0]}.${v[1]}.${v[2] + 1}`;
})();

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-rehearsal-'));
const prefix = path.join(work, 'prefix');
const home = path.join(work, 'home');
const bin =
  process.platform === 'win32' ? path.join(prefix, 'career-strike.cmd') : path.join(prefix, 'bin', 'career-strike');

function step(title: string): void {
  console.log(`\n== ${title}`);
}

function check(ok: boolean, message: string): void {
  if (!ok) throw new Error(`FAILED: ${message}`);
  console.log(`  ok  ${message}`);
}

function sh(cmd: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): string {
  return execFileSync(cmd, args, {
    cwd: opts.cwd,
    env: opts.env ?? process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
}

/** Stage the published files of this tree as version `version` and pack them. */
function pack(version: string, extraNotes: string | null): string {
  const stage = path.join(work, `stage-${version}`);
  fs.mkdirSync(stage);
  for (const f of [...pkg.files, 'package.json']) {
    if (fs.existsSync(path.join(ROOT, f))) fs.cpSync(path.join(ROOT, f), path.join(stage, f), { recursive: true });
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(stage, 'package.json'), 'utf8')) as Record<string, unknown>;
  manifest.version = version;
  fs.writeFileSync(path.join(stage, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  if (extraNotes) {
    const changelog = path.join(stage, 'CHANGELOG.md');
    fs.writeFileSync(
      changelog,
      fs.readFileSync(changelog, 'utf8').replace(/\n## /, `\n## [${version}] - rehearsal\n\n${extraNotes}\n\n## `),
    );
  }
  const out = path.join(work, 'packages');
  fs.mkdirSync(out, { recursive: true });
  const name = sh('npm', ['pack', '--ignore-scripts', '--silent', '--pack-destination', out], { cwd: stage })
    .trim()
    .split('\n')
    .pop()!;
  return path.join(out, name);
}

/** A loopback stand-in for GitHub's release list and downloads, offering version B. */
async function fakeGitHub(file: string): Promise<{ url: string; close: () => void }> {
  const body = fs.readFileSync(file);
  const sha = createHash('sha256').update(body).digest('hex');
  const server = http.createServer((req, res) => {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    if (req.url?.startsWith('/releases?')) {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify([
          {
            tag_name: `v${B}`,
            name: `Career Strike ${B}`,
            body: 'Rehearsal release.',
            html_url: `${base}/releases/v${B}`,
            published_at: new Date().toISOString(),
            assets: [
              { name: `career-strike-${B}.tgz`, browser_download_url: `${base}/download/career-strike-${B}.tgz` },
              {
                name: `career-strike-${B}.tgz.sha256`,
                browser_download_url: `${base}/download/career-strike-${B}.tgz.sha256`,
              },
            ],
          },
        ]),
      );
    } else if (req.url === `/download/career-strike-${B}.tgz`) {
      res.end(body);
    } else if (req.url === `/download/career-strike-${B}.tgz.sha256`) {
      res.end(`${sha}  career-strike-${B}.tgz\n`);
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/releases`, close: () => server.close() };
}

async function freePort(): Promise<number> {
  const s = http.createServer();
  await new Promise<void>((resolve) => s.listen(0, '127.0.0.1', resolve));
  const { port } = s.address() as AddressInfo;
  await new Promise((resolve) => s.close(resolve));
  return port;
}

async function main(): Promise<void> {
  step('Build and pack');
  sh('npm', ['run', 'build'], { cwd: ROOT });
  const pkgA = pack(A, null);
  const pkgB = pack(B, '- Rehearsal of the update path.');
  console.log(`  ${path.basename(pkgA)}, ${path.basename(pkgB)}`);

  const github = await fakeGitHub(pkgB);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CAREER_STRIKE_HOME: home,
    CAREER_STRIKE_SECRET_STORE: 'file',
    CAREER_STRIKE_RELEASES_URL: github.url,
    PATH: `${path.dirname(bin)}${path.delimiter}${process.env.PATH ?? ''}`,
    npm_config_prefix: prefix,
  };
  // Asynchronous on purpose: the fake GitHub runs in this process and must keep answering.
  const cs = (...args: string[]): Promise<{ code: number; out: string }> =>
    new Promise((resolve) => {
      execFile(bin, args, { env, encoding: 'utf8', shell: process.platform === 'win32' }, (err, stdout, stderr) => {
        resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, out: `${stdout}${stderr}`.trim() });
      });
    });
  const status = async () =>
    JSON.parse((await cs('status', '--json')).out) as { state: string; version?: string; port?: number };

  try {
    step(`Install ${A} and create data`);
    sh('npm', ['install', '--global', '--prefix', prefix, '--no-fund', '--no-audit', pkgA], { env });
    check((await cs('--version')).out === A, `installed program reports ${A}`);
    check((await cs('init', '--no-check-updates')).code === 0, 'init succeeds');
    const db = openDb(appPaths(home).db);
    setSetting(db, 'search.preferredRoles', ['Rehearsal Engineer'], 'rehearsal');
    db.close();
    const port = await freePort();
    check((await cs('start', '--port', String(port))).code === 0, `service starts on port ${port}`);
    check((await status()).version === A, `running service is ${A}`);

    step('Check');
    const raw = await cs('update', '--check', '--json');
    if (raw.code !== 0) console.log(raw.out);
    const checked = JSON.parse(raw.out) as { latest: string; updateAvailable: boolean };
    check(checked.updateAvailable && checked.latest === B, `update --check offers ${B}`);

    step(`Update ${A} → ${B}`);
    const updated = await cs('update', '--yes');
    console.log(updated.out.replace(/^/gm, '  | '));
    check(updated.code === 0, 'update exits successfully');
    check((await cs('--version')).out === B, `installed program reports ${B}`);
    const after = await status();
    check(after.state === 'running' && after.version === B, `running service is ${B}`);
    check(after.port === port, `service restarted on the same port (${port})`);
    const db2 = openDb(appPaths(home).db);
    check(JSON.stringify(getSettings(db2)['search.preferredRoles']) === '["Rehearsal Engineer"]', 'data is intact');
    db2.close();
    check(
      (await cs('update', '--check')).out.includes('newest version'),
      'update --check now says this is the newest version',
    );

    step(`Undo ${B} → ${A}`);
    const undone = await cs('update', '--undo', '--yes');
    console.log(undone.out.replace(/^/gm, '  | '));
    check(undone.code === 0, 'undo exits successfully');
    check((await cs('--version')).out === A, `installed program reports ${A} again`);
    const back = await status();
    check(back.state === 'running' && back.version === A && back.port === port, `service runs ${A} on port ${port}`);
    const db3 = openDb(appPaths(home).db);
    check(
      JSON.stringify(getSettings(db3)['search.preferredRoles']) === '["Rehearsal Engineer"]',
      'data is still intact',
    );
    db3.close();
    console.log('\nUpdate rehearsal passed.');
  } finally {
    await cs('stop');
    github.close();
    fs.rmSync(work, { recursive: true, force: true });
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
