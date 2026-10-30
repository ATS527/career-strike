import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempDir } from '../helpers.js';

// Packs Career Strike from a copy of this working tree, installs the tarball into an empty npm
// prefix (offline, from the local npm cache), and runs the installed program. Host CLIs are
// replaced by fakes on PATH so the real Codex, Claude Code and OpenCode settings are never touched.

const NODE_DIR = path.dirname(process.execPath);

function packFromCleanCopy(): string {
  const copy = path.join(tempDir('cs-pack-'), 'career-strike');
  const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    fs.mkdirSync(path.join(copy, path.dirname(f)), { recursive: true });
    fs.copyFileSync(f, path.join(copy, f));
  }
  fs.symlinkSync(path.resolve('node_modules'), path.join(copy, 'node_modules'), 'dir');
  const out = tempDir('cs-tgz-');
  execFileSync('npm', ['pack', '--pack-destination', out], { cwd: copy, stdio: 'pipe' });
  return path.join(out, fs.readdirSync(out).find((f) => f.endsWith('.tgz'))!);
}

function fakeHosts(): { bin: string; state: string; opencodeConfig: string } {
  const root = tempDir('cs-hosts-');
  const bin = path.join(root, 'bin');
  const state = path.join(root, 'state');
  fs.mkdirSync(bin);
  fs.mkdirSync(state);
  // codex and claude: "mcp list" prints the registered names; "mcp remove <name>" removes one.
  for (const [cmd, file] of [['codex', 'codex.txt'], ['claude', 'claude.txt']] as const) {
    fs.writeFileSync(path.join(state, file), 'career-strike\nother-server\n');
    fs.writeFileSync(
      path.join(bin, cmd),
      `#!/bin/sh
S="${path.join(state, file)}"
case "$1" in
  --version) echo "${cmd} 9.9.9-fake" ;;
  mcp) case "$2" in
    list) cat "$S" ;;
    remove) for a in "$@"; do last="$a"; done; grep -v "^$last$" "$S" > "$S.tmp"; mv "$S.tmp" "$S" ;;
  esac ;;
esac
`,
      { mode: 0o755 },
    );
  }
  // opencode: "mcp list" reads its JSON config, which Career Strike edits directly.
  const opencodeConfig = path.join(root, 'xdg', 'opencode', 'opencode.json');
  fs.mkdirSync(path.dirname(opencodeConfig), { recursive: true });
  fs.writeFileSync(opencodeConfig, JSON.stringify({ mcp: { servers: { 'career-strike': { command: ['x'] }, 'other-server': { command: ['y'] } } } }, null, 2));
  fs.writeFileSync(path.join(bin, 'opencode'), `#!/bin/sh\ncase "$1" in --version) echo "opencode 9.9.9-fake" ;; mcp) cat "${opencodeConfig}" ;; esac\n`, { mode: 0o755 });
  return { bin, state, opencodeConfig };
}

describe('packaged install', () => {
  it('installs from the npm pack tarball into a clean prefix, runs, and uninstalls without touching data', async () => {
    const tgz = packFromCleanCopy();
    const listing = execFileSync('tar', ['tzf', tgz], { encoding: 'utf8' }).split('\n');
    expect(listing).toContain('package/dist/cli/index.js');
    expect(listing).toContain('package/dist/web/index.html');
    expect(listing.filter((f) => /^package\/(src|test|acceptance|scripts)\//.test(f))).toEqual([]);

    const prefix = path.join(tempDir('cs-prefix-'), 'prefix');
    const install = spawnSync('npm', ['install', '--global', '--prefix', prefix, '--offline', '--no-audit', '--no-fund', tgz], { encoding: 'utf8' });
    expect(install.status, `offline install from the local npm cache failed:\n${install.stderr}`).toBe(0);
    const bin = path.join(prefix, 'bin', 'career-strike');
    expect(fs.existsSync(bin)).toBe(true);

    const home = path.join(tempDir(), 'data');
    const hosts = fakeHosts();
    const env = {
      PATH: [hosts.bin, NODE_DIR, '/usr/bin', '/bin'].join(path.delimiter),
      HOME: process.env.HOME!,
      CAREER_STRIKE_HOME: home,
      CAREER_STRIKE_SECRET_STORE: 'file',
      XDG_CONFIG_HOME: path.join(path.dirname(hosts.opencodeConfig), '..'),
    };
    const run = (...args: string[]) => spawnSync(bin, args, { env, encoding: 'utf8', timeout: 60_000 });

    expect(run('--version').stdout.trim()).toBe(JSON.parse(fs.readFileSync('package.json', 'utf8')).version);
    expect(run('init').status).toBe(0);
    const doctor = run('doctor');
    expect(doctor.status, doctor.stdout).toBe(0);
    expect(doctor.stdout).toContain('PASS  dashboard-files');

    // The installed service starts and serves the dashboard.
    const serve = spawn(bin, ['serve', '--port', '0'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    const port = await new Promise<number>((resolve, reject) => {
      let out = '';
      serve.stdout.on('data', (d: Buffer) => {
        out += d.toString();
        const m = out.match(/127\.0\.0\.1:(\d+)/);
        if (m) resolve(Number(m[1]));
      });
      serve.once('exit', (code) => reject(new Error(`serve exited ${code}: ${out}`)));
    });
    const page = await fetch(`http://127.0.0.1:${port}/`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<div id="root">');
    serve.kill('SIGTERM');
    await new Promise((r) => serve.once('exit', r));

    // Uninstall: host entries and the program go; other host entries and all data stay.
    const un = run('uninstall');
    expect(un.status, un.stdout + un.stderr).toBe(0);
    for (const host of ['codex', 'claude-code', 'opencode']) expect(un.stdout).toContain(`Removed Career Strike from ${host}.`);
    expect(fs.readFileSync(path.join(hosts.state, 'codex.txt'), 'utf8')).toBe('other-server\n');
    expect(fs.readFileSync(path.join(hosts.state, 'claude.txt'), 'utf8')).toBe('other-server\n');
    expect(JSON.parse(fs.readFileSync(hosts.opencodeConfig, 'utf8'))).toEqual({ mcp: { servers: { 'other-server': { command: ['y'] } } } });
    expect(fs.existsSync(bin)).toBe(false);
    expect(fs.existsSync(path.join(prefix, 'lib', 'node_modules', 'career-strike'))).toBe(false);
    expect(fs.existsSync(path.join(home, 'career-strike.db'))).toBe(true);
    expect(un.stdout).toContain('Your data is still in');
  }, 300_000);
});
