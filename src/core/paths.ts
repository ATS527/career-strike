import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface AppPaths {
  home: string;
  db: string;
  vault: string;
  logs: string;
  runtimeFile: string;
}

export class UnsafeHomeError extends Error {}

/** Per-user data directory. Career data never lives in the source tree. */
export function resolveHome(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  homedir: string = os.homedir(),
): string {
  if (env.CAREER_STRIKE_HOME) return path.resolve(env.CAREER_STRIKE_HOME);
  if (platform === 'darwin') return path.join(homedir, 'Library', 'Application Support', 'career-strike');
  if (platform === 'win32') return path.join(env.APPDATA ?? path.join(homedir, 'AppData', 'Roaming'), 'career-strike');
  return path.join(env.XDG_DATA_HOME ?? path.join(homedir, '.local', 'share'), 'career-strike');
}

export function appPaths(home: string = resolveHome()): AppPaths {
  return {
    home,
    db: path.join(home, 'career-strike.db'),
    vault: path.join(home, 'vault'),
    logs: path.join(home, 'logs'),
    runtimeFile: path.join(home, 'service.json'),
  };
}

/** Root of the enclosing git working tree, or null. Works for paths that do not exist yet. */
export function findGitRoot(start: string): string | null {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function ensureHome(paths: AppPaths): void {
  const repo = findGitRoot(paths.home);
  if (repo) {
    throw new UnsafeHomeError(
      `Refusing to store career data inside the git working tree ${repo}. ` +
        'Set CAREER_STRIKE_HOME to a directory outside any repository.',
    );
  }
  for (const dir of [paths.home, paths.vault, paths.logs]) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    if (process.platform !== 'win32') fs.chmodSync(dir, 0o700);
  }
}
