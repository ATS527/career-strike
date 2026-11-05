// Blocks secrets and personal data from entering git. Scans staged content (what will actually be
// committed), not the working tree. Personal identifiers to block are listed one per line in
// <data home>/privacy-denylist.txt, which lives outside the repository by design.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveHome } from '../src/core/paths.js';

export interface Finding {
  file: string;
  line: number;
  rule: string;
}

const SECRET_RULES: readonly [string, RegExp][] = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY/],
  ['aws-access-key', /\bAKIA[0-9A-Z]{16}\b/],
  ['github-token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{40,}/],
  ['anthropic-key', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['openai-key', /\bsk-(?:proj-)?[A-Za-z0-9]{32,}/],
  ['slack-token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
];

// Synthetic and attribution addresses that may legitimately appear in source.
const ALLOWED_EMAIL_DOMAINS = new Set(['example.com', 'example.org', 'example.net', 'anthropic.com']);
const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

export function scanText(file: string, text: string, denylist: readonly string[]): Finding[] {
  const findings: Finding[] = [];
  const lowered = denylist.map((d) => d.toLowerCase());
  text.split('\n').forEach((content, i) => {
    const line = i + 1;
    for (const [rule, re] of SECRET_RULES) if (re.test(content)) findings.push({ file, line, rule });
    for (const m of content.matchAll(EMAIL)) {
      if (!ALLOWED_EMAIL_DOMAINS.has((m[1] ?? '').toLowerCase())) findings.push({ file, line, rule: 'email-address' });
    }
    const lower = content.toLowerCase();
    if (lowered.some((d) => lower.includes(d))) findings.push({ file, line, rule: 'denylisted-personal-term' });
  });
  return findings;
}

export function loadDenylist(home: string = resolveHome()): string[] {
  const file = path.join(home, 'privacy-denylist.txt');
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length >= 3 && !l.startsWith('#'));
}

export function scanStaged(cwd: string, denylist: readonly string[], env: NodeJS.ProcessEnv = process.env): Finding[] {
  const files = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], {
    cwd,
    encoding: 'utf8',
    env,
  })
    .split('\0')
    .filter(Boolean);
  return files.flatMap((file) => {
    const staged = execFileSync('git', ['show', `:${file}`], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      env,
    });
    return staged.includes('\0') ? [] : scanText(file, staged, denylist);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const findings = scanStaged(process.cwd(), loadDenylist());
  // Report locations and rule names only; never echo the matched value.
  for (const f of findings) console.error(`privacy-scan: ${f.file}:${f.line} ${f.rule}`);
  if (findings.length > 0) {
    console.error(`privacy-scan: ${findings.length} finding(s); commit blocked.`);
    process.exitCode = 1;
  }
}
