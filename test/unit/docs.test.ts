import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadDenylist, scanText } from '../../scripts/privacy-scan.js';

const DOCS = ['README.md', 'docs/install.md', 'docs/privacy.md', 'docs/limitations.md'];
const read = (f: string): string => fs.readFileSync(f, 'utf8');

describe('user documentation', () => {
  it('install, privacy-model and known-limitations docs exist and are linked from the README', () => {
    for (const f of DOCS) expect(read(f).length, f).toBeGreaterThan(500);
    for (const f of DOCS.slice(1)) expect(read('README.md')).toContain(`](${f})`);
  });

  it('documents every CLI command', () => {
    const commands = [...read('src/cli/index.ts').matchAll(/\.command\('([a-z-]+)'\)/g)].map((m) => m[1]!);
    expect(commands.length).toBeGreaterThan(10);
    // `mcp` is launched by assistants, not by people; it is described under connecting assistants.
    for (const c of commands.filter((x) => x !== 'mcp')) expect(read('docs/install.md'), c).toMatch(new RegExp(`career-strike ${c}\\b|\`${c}\``));
  });

  it('states the facts it relies on correctly', () => {
    const install = read('docs/install.md');
    const port = read('src/service/service.ts').match(/DEFAULT_PORT = (\d+)/)![1]!;
    expect(install).toContain(`127.0.0.1:${port}`);
    expect(install).toContain(`--confirm "${read('src/cli/index.ts').match(/DELETE_PHRASE = '([^']+)'/)![1]}"`);
    // Every host the service can contact is listed in the privacy model, and nothing else.
    const hosts = [...new Set([...read('src/sources/adapters.ts').matchAll(/https:\/\/([a-z.-]+)\/(?:v\d|v0|posting-api)/g)].map((m) => m[1]!))].sort();
    expect(hosts).toEqual(['api.ashbyhq.com', 'api.lever.co', 'boards-api.greenhouse.io']);
    const privacy = read('docs/privacy.md');
    for (const h of hosts) expect(privacy).toContain(`\`${h}\``);
  });

  it('relative links resolve', () => {
    for (const f of DOCS) {
      for (const [, target] of read(f).matchAll(/\]\(([^)#:]+)(?:#[^)]*)?\)/g)) {
        expect(fs.existsSync(path.join(path.dirname(f), target!)), `${f} → ${target}`).toBe(true);
      }
    }
  });

  it('pass the privacy scan (no secrets, real email addresses or personal terms)', () => {
    const denylist = loadDenylist();
    for (const f of DOCS) expect(scanText(f, read(f), denylist), f).toEqual([]);
  });
});
