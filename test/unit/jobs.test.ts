import { describe, expect, it } from 'vitest';
import { duplicateKey, effectiveStatus, FRESH_FOR_MS } from '../../src/career/jobs.js';

describe('canonical identity', () => {
  it('treats case, punctuation and spacing differences as the same role', () => {
    expect(duplicateKey('Synthetic Labs, Inc.', 'Senior  Data-Engineer', 'Berlin')).toBe(duplicateKey('synthetic labs inc', 'senior data engineer', 'BERLIN'));
  });

  it('keeps different roles, employers or places apart', () => {
    const base = duplicateKey('Synthetic Labs', 'Data Engineer', 'Berlin');
    expect(duplicateKey('Synthetic Labs', 'Data Analyst', 'Berlin')).not.toBe(base);
    expect(duplicateKey('Other Labs', 'Data Engineer', 'Berlin')).not.toBe(base);
    expect(duplicateKey('Synthetic Labs', 'Data Engineer', 'Munich')).not.toBe(base);
    expect(duplicateKey('Synthetic Labs', 'Data Engineer', null)).not.toBe(base);
  });
});

describe('effective status', () => {
  it('only CLOSED and UNVERIFIED pass through unchanged', () => {
    expect(effectiveStatus('CLOSED', new Date().toISOString())).toBe('CLOSED');
    expect(effectiveStatus('UNVERIFIED', null)).toBe('UNVERIFIED');
  });

  it('downgrades OPEN to STALE at the freshness boundary', () => {
    const now = Date.parse('2026-10-30T00:00:00Z');
    expect(effectiveStatus('OPEN', new Date(now - FRESH_FOR_MS).toISOString(), now)).toBe('OPEN');
    expect(effectiveStatus('OPEN', new Date(now - FRESH_FOR_MS - 1000).toISOString(), now)).toBe('STALE');
  });
});

describe('job query flags', () => {
  it('parses query-string booleans strictly', async () => {
    const { JobQuery } = await import('../../src/career/jobs.js');
    expect(JobQuery.parse({ includeExcludedEmployers: 'false' }).includeExcludedEmployers).toBe(false);
    expect(JobQuery.parse({ includeExcludedEmployers: 'true' }).includeExcludedEmployers).toBe(true);
    expect(JobQuery.parse({}).immediateStart).toBe(false);
    expect(JobQuery.safeParse({ immediateStart: 'yes' }).success).toBe(false);
  });
});
