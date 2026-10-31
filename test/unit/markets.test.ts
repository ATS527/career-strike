import { describe, expect, it } from 'vitest';
import { COUNTRY_REGISTRY, normaliseLocation } from '../../src/markets/countries.js';
import { capabilityForName } from '../../src/sources/capabilities.js';
import { marketFacts } from '../../src/sources/normalize.js';
import { EMPLOYER_TARGETS, verifyTargetDiscovery } from '../../src/markets/employers.js';
import { employerTargetRecord } from '../../src/markets/employers.js';
import { INDIA_SOURCE_ASSESSMENTS, officialIndiaSearchUrl } from '../../src/markets/india-sources.js';
import type { SourceAdapter } from '../../src/sources/types.js';
import path from 'node:path';
import { openDb } from '../../src/store/db.js';
import { tempDir } from '../helpers.js';

describe('configured markets', () => {
  it('configures the agreed rollout markets without claiming discovery availability', () => {
    expect(Object.keys(COUNTRY_REGISTRY)).toEqual(['DE', 'IN', 'SG', 'MY', 'ID', 'PH', 'TH', 'VN']);
    expect(Object.values(COUNTRY_REGISTRY).every((country) => country.status === 'CONFIGURED')).toBe(true);
    expect(COUNTRY_REGISTRY.IN.defaultCities).toContain('Bengaluru');
    expect(COUNTRY_REGISTRY.VN.currencies).toEqual(['VND']);
    expect(EMPLOYER_TARGETS.map((target) => `${target.source}/${target.board}`)).toEqual([
      'lever/saviynt', 'greenhouse/kraftonindia', 'ashby/sarvam', 'ashby/harvey',
    ]);
  });

  it('normalises only configured, evidence-bearing country and city spellings', () => {
    expect(normaliseLocation('Bangalore, India')).toEqual({ countryCode: 'IN', city: 'Bengaluru', originalText: 'Bangalore, India' });
    expect(normaliseLocation('München, Germany')).toEqual({ countryCode: 'DE', city: 'Munich', originalText: 'München, Germany' });
    expect(normaliseLocation('Remote, APAC')).toEqual({ countryCode: null, city: null, originalText: 'Remote, APAC' });
  });

  it('keeps remote eligibility and source capability honest', () => {
    expect(marketFacts('Remote', 'remote')).toMatchObject({ remoteEligibility: 'unknown', remoteEligibleCountries: [], visaSponsorship: 'unknown' });
    expect(capabilityForName('greenhouse')).toBe('AUTHORIZED_EMPLOYER_DIRECT');
    expect(capabilityForName('manual')).toBe('USER_DRIVEN_DISCOVERY');
    expect(capabilityForName('unreviewed-marketplace')).toBe('UNVERIFIED');
  });

  it('does not turn Indian marketplaces into automatic integrations', () => {
    expect(INDIA_SOURCE_ASSESSMENTS.every((source) => source.automatedRetrieval === false)).toBe(true);
    expect(INDIA_SOURCE_ASSESSMENTS.find((source) => source.id === 'linkedin-jobs')?.capability).toBe('RESTRICTED');
    expect(INDIA_SOURCE_ASSESSMENTS.find((source) => source.id === 'ncs')?.capability).toBe('USER_DRIVEN_DISCOVERY');
    const linkedin = INDIA_SOURCE_ASSESSMENTS.find((source) => source.id === 'linkedin-jobs')!;
    const indeed = INDIA_SOURCE_ASSESSMENTS.find((source) => source.id === 'indeed-india')!;
    expect(officialIndiaSearchUrl(linkedin, 'iOS Swift')).toContain('keywords=iOS+Swift');
    expect(officialIndiaSearchUrl(linkedin, 'iOS Swift')).toContain('location=India');
    expect(officialIndiaSearchUrl(indeed, 'iOS Swift')).toContain('q=iOS+Swift');
    expect(officialIndiaSearchUrl(indeed, 'iOS Swift')).toContain('l=India');
  });

  it('requires an actual permitted response with explicit India evidence before certifying discovery', async () => {
    const target = EMPLOYER_TARGETS[0]!;
    const adapter: SourceAdapter = {
      id: 'lever', label: 'test', boardUrl: () => 'https://jobs.lever.co/saviynt',
      list: async () => [{
        source: 'lever', board: 'saviynt', sourceJobId: '1', employer: 'Saviynt', title: 'Engineer', locationText: 'Bengaluru, India',
        remotePolicy: 'onsite', employmentType: 'full_time', department: null, salary: null, description: [], applyUrl: null, postingUrl: null,
        publishedAt: null, unresolved: [],
      }],
    };
    const verified = await verifyTargetDiscovery(target, adapter, 'IN', new Date('2026-10-31T12:00:00.000Z'));
    expect(verified.countryPostings).toHaveLength(1);
    await expect(verifyTargetDiscovery(target, { ...adapter, list: async () => [] }, 'IN')).rejects.toThrow('remains CONFIGURED');
  });

  it('keeps registry retrieval timestamps empty until the board is actually adopted', () => {
    const db = openDb(path.join(tempDir('cs-market-target-'), 'cs.db'));
    expect(employerTargetRecord(db, EMPLOYER_TARGETS[0]!)).toMatchObject({
      monitoringState: 'NOT_ADOPTED', lastSuccessfulRetrievalAt: null, lastVerificationAt: '2026-10-31T00:00:00.000Z',
    });
  });
});
