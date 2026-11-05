import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFileLogger, redact, redactFields } from '../../src/core/log.js';
import { tempDir } from '../helpers.js';

const TOKEN = 'Q'.repeat(43);

describe('log redaction', () => {
  it('redacts bearer tokens, token query parameters, emails, phone numbers and long tokens', () => {
    expect(redact(`Authorization: Bearer ${TOKEN}`)).toBe('Authorization: Bearer [REDACTED]');
    expect(redact(`/auth/launch?t=${TOKEN}&x=1`)).toBe('/auth/launch?t=[REDACTED]&x=1');
    expect(redact('mail synthetic.person@example.com now')).toBe('mail [EMAIL] now');
    expect(redact('call +1 (555) 010-9999 today')).toBe('call [PHONE] today');
    expect(redact(`id ${TOKEN}`)).toBe('id [TOKEN]');
  });

  it('drops secret fields and reduces content fields to their length', () => {
    expect(
      redactFields({
        authorization: 'x',
        csrf: 'y',
        resume: 'Synthetic resume text',
        nested: { coverLetter: 'abc', ok: 'fine' },
      }),
    ).toEqual({
      authorization: '[REDACTED]',
      csrf: '[REDACTED]',
      resume: '[21 chars]',
      nested: { coverLetter: '[3 chars]', ok: 'fine' },
    });
  });

  it('writes owner-only JSON lines that never contain the secret', () => {
    const dir = tempDir('cs-log-');
    const log = createFileLogger(dir);
    log.info('http.request', { path: `/auth/launch?t=${TOKEN}`, token: TOKEN });
    const text = fs.readFileSync(path.join(dir, 'service.log'), 'utf8');
    expect(text).not.toContain(TOKEN);
    expect(JSON.parse(text.trim())).toMatchObject({ level: 'info', event: 'http.request', token: '[REDACTED]' });
    if (process.platform !== 'win32') expect(fs.statSync(path.join(dir, 'service.log')).mode & 0o777).toBe(0o600);
  });

  it('rotates when the file exceeds the size limit', () => {
    const dir = tempDir('cs-log-');
    const log = createFileLogger(dir, 'service.log', 100);
    for (let i = 0; i < 5; i++) log.info('event', { i });
    expect(fs.existsSync(path.join(dir, 'service.log.1'))).toBe(true);
  });
});
