import fs from 'node:fs';

// Resolves to <package>/CHANGELOG.md from both src/updates and dist/updates.
const CHANGELOG = new URL('../../CHANGELOG.md', import.meta.url);

/** The CHANGELOG.md section for one version ("## [0.2.0] - 2026-11-01"), without its heading. */
export function notesFor(version: string, text?: string): string | null {
  let source = text;
  if (source === undefined) {
    try {
      source = fs.readFileSync(CHANGELOG, 'utf8');
    } catch {
      return null;
    }
  }
  const lines = source.split('\n');
  const start = lines.findIndex((l) => new RegExp(`^## \\[?v?${version.replace(/\./g, '\\.')}\\]?(\\s|$)`).test(l));
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  const body = lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim();
  return body || null;
}
