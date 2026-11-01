// Records in the build where this copy's releases are published (dist/release.json), so
// `career-strike update` knows where to look. The repository is taken from GitHub Actions'
// GITHUB_REPOSITORY, or from the `origin` remote of a local checkout; it is never hard-coded.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

function fromRemote(): string | null {
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return /github\.com[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(url)?.[1] ?? null;
  } catch {
    return null;
  }
}

const repository = process.env.GITHUB_REPOSITORY ?? fromRemote();
const file = path.join(ROOT, 'dist', 'release.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, `${JSON.stringify({ repository }, null, 2)}\n`);
console.log(repository ? `Release source: ${repository}` : 'Release source: unknown (no GitHub origin); `career-strike update` will not be available.');
