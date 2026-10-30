import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanStaged, scanText } from '../../scripts/privacy-scan.js';
import { tempDir } from '../helpers.js';

// Secret-shaped fixtures are assembled at runtime so this file never trips the scanner itself.
const FAKE_AWS = ['AKIA', 'Z'.repeat(16)].join('');
const FAKE_KEY_HEADER = ['-----BEGIN', 'PRIVATE KEY-----'].join(' ');
const FAKE_EMAIL = ['synthetic.person', 'mailbox.test'].join('@');

function repoWith(files: Record<string, string>): string {
  const dir = tempDir('cs-scan-');
  execFileSync('git', ['init', '-q'], { cwd: dir });
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  execFileSync('git', ['add', '-A'], { cwd: dir });
  return dir;
}

describe('privacy scan', () => {
  it('flags secrets, real-looking emails and denylisted personal terms by line', () => {
    const text = ['ok line', `key = "${FAKE_AWS}"`, FAKE_KEY_HEADER, `contact ${FAKE_EMAIL}`, 'Jordan Synthetic was here'].join('\n');
    const rules = scanText('f.ts', text, ['jordan synthetic']).map((f) => `${f.line}:${f.rule}`);
    expect(rules).toEqual(['2:aws-access-key', '3:private-key', '4:email-address', '5:denylisted-personal-term']);
  });

  it('allows synthetic example addresses and clean code', () => {
    expect(scanText('f.ts', 'const e = "candidate@example.com";\nCo-Authored-By: Claude <noreply@anthropic.com>', [])).toEqual([]);
  });

  it('scans staged content, not the working tree', () => {
    const dir = repoWith({ 'a.txt': 'clean' });
    fs.writeFileSync(path.join(dir, 'a.txt'), `unstaged ${FAKE_AWS}`);
    expect(scanStaged(dir, [])).toEqual([]);
    execFileSync('git', ['add', 'a.txt'], { cwd: dir });
    expect(scanStaged(dir, []).map((f) => f.rule)).toEqual(['aws-access-key']);
  });

  it('CLI exits non-zero without echoing the secret value', () => {
    const dir = repoWith({ 'config/leak.ts': `export const k = "${FAKE_AWS}";\n` });
    const res = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), path.resolve('scripts/privacy-scan.ts')], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, CAREER_STRIKE_HOME: path.join(tempDir(), 'home') },
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('config/leak.ts:1 aws-access-key');
    expect(res.stderr).not.toContain(FAKE_AWS);
  });

  it('CLI reads the denylist from the data directory outside the repo', () => {
    const home = path.join(tempDir(), 'home');
    fs.mkdirSync(home, { recursive: true });
    fs.writeFileSync(path.join(home, 'privacy-denylist.txt'), '# personal terms\nJordan Synthetic\n');
    const dir = repoWith({ 'notes.md': 'Resume of Jordan Synthetic\n' });
    const res = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), path.resolve('scripts/privacy-scan.ts')], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, CAREER_STRIKE_HOME: home },
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('notes.md:1 denylisted-personal-term');
  });
});
