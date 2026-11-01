import { describe, expect, it } from 'vitest';
import { normalizeLinkedInUrl } from '../../src/career/linkedin-url.js';

describe('LinkedIn URL normalization', () => {
  it('normalizes valid member profile addresses to canonical form', () => {
    const valid: [string, string][] = [
      ['https://www.linkedin.com/in/alex-smith', 'https://www.linkedin.com/in/alex-smith/'],
      ['https://www.linkedin.com/in/alex-smith/', 'https://www.linkedin.com/in/alex-smith/'],
      ['http://www.linkedin.com/in/alex-smith', 'https://www.linkedin.com/in/alex-smith/'],
      ['linkedin.com/in/alex-smith', 'https://www.linkedin.com/in/alex-smith/'],
      ['www.linkedin.com/in/alex-smith', 'https://www.linkedin.com/in/alex-smith/'],
      ['in.linkedin.com/in/alex_smith', 'https://www.linkedin.com/in/alex_smith/'],
      ['uk.linkedin.com/in/alex-smith-123/', 'https://www.linkedin.com/in/alex-smith-123/'],
      ['https://LINKEDIN.COM/IN/ALEX-SMITH/', 'https://www.linkedin.com/in/alex-smith/'],
    ];

    for (const [input, expected] of valid) {
      const res = normalizeLinkedInUrl(input);
      expect(res, input).toEqual({ ok: true, url: expected });
    }
  });

  it('rejects empty or whitespace-only inputs', () => {
    expect(normalizeLinkedInUrl('')).toEqual({ ok: false, reason: 'Enter your LinkedIn profile address.' });
    expect(normalizeLinkedInUrl('   ')).toEqual({ ok: false, reason: 'Enter your LinkedIn profile address.' });
  });

  it('rejects overly long addresses', () => {
    const long = 'https://www.linkedin.com/in/' + 'a'.repeat(300);
    expect(normalizeLinkedInUrl(long)).toEqual({ ok: false, reason: 'That address is too long.' });
  });

  it('rejects addresses with usernames, passwords or ports', () => {
    expect(normalizeLinkedInUrl(['https://user:pass', 'linkedin.com/in/alex'].join('@'))).toEqual({
      ok: false,
      reason: 'That address contains a user name, password or port.',
    });
    expect(normalizeLinkedInUrl('https://linkedin.com:8443/in/alex')).toEqual({
      ok: false,
      reason: 'That address contains a user name, password or port.',
    });
  });

  it('rejects addresses not belonging to linkedin.com', () => {
    expect(normalizeLinkedInUrl('https://example.com/in/alex')).toEqual({
      ok: false,
      reason: 'That is not a linkedin.com address.',
    });
    expect(normalizeLinkedInUrl('https://evil-linkedin.com/in/alex')).toEqual({
      ok: false,
      reason: 'That is not a linkedin.com address.',
    });
  });

  it('rejects company, job, and non-profile pages', () => {
    expect(normalizeLinkedInUrl('https://www.linkedin.com/company/acme')).toEqual({
      ok: false,
      reason: 'Use your member profile address, which looks like linkedin.com/in/your-name.',
    });
    expect(normalizeLinkedInUrl('https://www.linkedin.com/jobs/view/12345')).toEqual({
      ok: false,
      reason: 'Use your member profile address, which looks like linkedin.com/in/your-name.',
    });
  });

  it('rejects profile names that are too short or invalid', () => {
    expect(normalizeLinkedInUrl('https://www.linkedin.com/in/ab')).toEqual({
      ok: false,
      reason: 'That profile name is not valid.',
    });
    expect(normalizeLinkedInUrl('https://www.linkedin.com/in/a!b')).toEqual({
      ok: false,
      reason: 'That profile name is not valid.',
    });
  });
});
