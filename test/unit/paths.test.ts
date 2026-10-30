import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { appPaths, ensureHome, findGitRoot, resolveHome, UnsafeHomeError } from '../../src/core/paths.js';
import { tempDir } from '../helpers.js';

describe('resolveHome', () => {
  it('honours CAREER_STRIKE_HOME', () => {
    expect(resolveHome({ CAREER_STRIKE_HOME: '/tmp/cs-x' }, 'linux', '/home/u')).toBe(path.resolve('/tmp/cs-x'));
  });
  it('uses Application Support on macOS', () => {
    expect(resolveHome({}, 'darwin', '/Users/u')).toBe('/Users/u/Library/Application Support/career-strike');
  });
  it('uses XDG_DATA_HOME on Linux with a ~/.local/share fallback', () => {
    expect(resolveHome({ XDG_DATA_HOME: '/data' }, 'linux', '/home/u')).toBe('/data/career-strike');
    expect(resolveHome({}, 'linux', '/home/u')).toBe('/home/u/.local/share/career-strike');
  });
});

describe('ensureHome', () => {
  it.skipIf(process.platform === 'win32')('creates owner-only directories', () => {
    const home = path.join(tempDir(), 'data');
    ensureHome(appPaths(home));
    for (const dir of [home, path.join(home, 'vault'), path.join(home, 'logs')]) {
      expect(fs.statSync(dir).mode & 0o777).toBe(0o700);
    }
  });

  it('refuses a data directory inside a git working tree and creates nothing', () => {
    const repo = tempDir('cs-repo-');
    fs.mkdirSync(path.join(repo, '.git'));
    const home = path.join(repo, 'nested', 'data');
    expect(findGitRoot(home)).toBe(repo);
    expect(() => ensureHome(appPaths(home))).toThrow(UnsafeHomeError);
    expect(fs.existsSync(path.join(repo, 'nested'))).toBe(false);
  });

  it('finds no git root for a plain temp directory', () => {
    expect(findGitRoot(tempDir())).toBeNull();
  });
});
