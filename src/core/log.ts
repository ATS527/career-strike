import fs from 'node:fs';
import path from 'node:path';

// Field names whose values are never written to logs, whatever they contain.
const SECRET_KEYS = /^(?:authorization|cookie|set-cookie|token|password|secret|csrf|api[-_]?key|launch[-_]?token)$/i;
// Field names that can carry candidate content; logged only as their length.
const CONTENT_KEYS = /^(?:text|content|body|resume|cover[-_]?letter|description|notes?)$/i;

const PATTERNS: readonly [RegExp, string][] = [
  [/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]'],
  [/([?&](?:t|token|key|code)=)[^&\s#]+/gi, '$1[REDACTED]'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[EMAIL]'],
  [/\+?\d[\d\s().-]{7,}\d/g, '[PHONE]'],
  [/\b[A-Za-z0-9_-]{32,}\b/g, '[TOKEN]'],
];

export function redact(text: string): string {
  return PATTERNS.reduce((acc, [re, replacement]) => acc.replace(re, replacement), text);
}

export function redactFields(value: unknown, key = ''): unknown {
  if (SECRET_KEYS.test(key)) return '[REDACTED]';
  if (CONTENT_KEYS.test(key)) return typeof value === 'string' ? `[${value.length} chars]` : '[REDACTED]';
  if (typeof value === 'string') return redact(value);
  if (Array.isArray(value)) return value.map((v) => redactFields(v));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactFields(v, k)]));
  }
  return value;
}

export interface Logger {
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

export const nullLogger: Logger = { info: () => {}, warn: () => {}, error: () => {} };

/** JSON-lines logger with redaction and single-file size rotation. Files are owner-only. */
export function createFileLogger(dir: string, name = 'service.log', maxBytes = 5 * 1024 * 1024): Logger {
  const file = path.join(dir, name);
  const write = (level: string, event: string, fields: Record<string, unknown> = {}): void => {
    try {
      if (fs.existsSync(file) && fs.statSync(file).size > maxBytes) fs.renameSync(file, `${file}.1`);
      const line = JSON.stringify({ at: new Date().toISOString(), level, event, ...(redactFields(fields) as object) });
      fs.appendFileSync(file, `${line}\n`, { mode: 0o600 });
    } catch {
      // Logging must never take the service down.
    }
  };
  return {
    info: (e, f) => write('info', e, f),
    warn: (e, f) => write('warn', e, f),
    error: (e, f) => write('error', e, f),
  };
}
