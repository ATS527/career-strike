import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { latestKnownVersion } from '../../src/store/db.js';
import { tempDir } from '../helpers.js';

const CLI = ['--import', 'tsx', path.resolve('src/cli/index.ts')];

function env(home: string): NodeJS.ProcessEnv {
  return { ...process.env, CAREER_STRIKE_HOME: home };
}

function runCli(home: string, args: string[]) {
  return spawnSync(process.execPath, [...CLI, ...args], { env: env(home), encoding: 'utf8', timeout: 15_000 });
}

function waitForOutput(child: ChildProcess, re: RegExp, timeoutMs = 15_000): Promise<RegExpMatchArray> {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${re}; output: ${output}`)), timeoutMs);
    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      const match = output.match(re);
      if (match) {
        clearTimeout(timer);
        resolve(match);
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`CLI exited with ${code}: ${output}`));
    });
  });
}

describe('career-strike CLI', () => {
  it('doctor fails before init and passes after', () => {
    const home = path.join(tempDir(), 'data');
    const before = runCli(home, ['doctor']);
    expect(before.status).toBe(1);
    expect(before.stdout).toMatch(/FAIL\s+database/);

    const init = runCli(home, ['init']);
    expect(init.status, init.stderr).toBe(0);
    expect(init.stdout).toContain(`Database schema: v${latestKnownVersion()}`);

    const after = runCli(home, ['doctor']);
    expect(after.stdout).toMatch(/PASS\s+database/);
    // The dashboard check reports the truth about this checkout: built or not.
    if (fs.existsSync('dist/web/index.html')) {
      expect(after.status, after.stdout).toBe(0);
      expect(after.stdout).not.toContain('FAIL');
    } else {
      expect(after.status).toBe(1);
      expect(after.stdout.split('\n').filter((l) => l.startsWith('FAIL'))).toEqual([expect.stringMatching(/^FAIL\s+dashboard-files\s+missing/)]);
    }
  });

  it('reports true lifecycle state across serve, status and shutdown', async () => {
    const home = path.join(tempDir(), 'data');
    const stopped = runCli(home, ['status', '--json']);
    expect(stopped.status).toBe(3);
    expect(JSON.parse(stopped.stdout)).toEqual({ state: 'stopped' });

    const server = spawn(process.execPath, [...CLI, 'serve', '--port', '0'], { env: env(home), stdio: ['ignore', 'pipe', 'pipe'] });
    try {
      await waitForOutput(server, /listening on http:\/\/127\.0\.0\.1:(\d+)/);
      const status = runCli(home, ['status', '--json']);
      expect(status.status, status.stderr).toBe(0);
      expect(JSON.parse(status.stdout)).toMatchObject({ state: 'running', pid: server.pid });
      const { token } = JSON.parse(fs.readFileSync(path.join(home, 'service.json'), 'utf8')) as { token: string };
      expect(status.stdout).not.toContain(token);

      const second = runCli(home, ['serve', '--port', '0']);
      expect(second.status).toBe(2);
      expect(second.stderr).toContain('already running');
    } finally {
      server.kill('SIGTERM');
      if (server.exitCode === null) await once(server, 'exit');
    }
    expect(server.exitCode).toBe(0);

    const after = runCli(home, ['status', '--json']);
    expect(after.status).toBe(3);
    expect(JSON.parse(after.stdout)).toEqual({ state: 'stopped' });
  });

  it('start runs a detached service, dashboard prints a working single-use link, stop ends it', async () => {
    const home = path.join(tempDir(), 'data');
    const start = runCli(home, ['start', '--port', '0']);
    try {
      expect(start.status, start.stderr).toBe(0);
      expect(start.stdout).toMatch(/running on http:\/\/127\.0\.0\.1:\d+ \(pid \d+\)/);
      const again = runCli(home, ['start', '--port', '0']);
      expect(again.stdout).toBe(start.stdout);

      const dash = runCli(home, ['dashboard', '--no-open']);
      expect(dash.status, dash.stderr).toBe(0);
      const url = new URL(dash.stdout.trim());
      expect(url.hostname).toBe('127.0.0.1');
      expect(url.pathname).toBe('/auth/launch');
      const res = await fetch(url, { redirect: 'manual' });
      expect(res.status).toBe(303);
      expect(res.headers.get('set-cookie')).toContain('HttpOnly');
      expect((await fetch(url, { redirect: 'manual' })).status).toBe(401);
    } finally {
      const stop = runCli(home, ['stop']);
      expect(stop.status, stop.stderr).toBe(0);
      expect(stop.stdout.trim()).toBe('stopped');
    }
    expect(runCli(home, ['stop']).stdout.trim()).toBe('not-running');
    expect(runCli(home, ['status']).status).toBe(3);
  });

  it('refuses to initialise inside a git working tree', () => {
    const repo = tempDir('cs-repo-');
    fs.mkdirSync(path.join(repo, '.git'));
    const res = runCli(path.join(repo, 'data'), ['init']);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('Refusing to store career data inside the git working tree');
  });
});
