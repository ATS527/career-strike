import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUSTRALIA_SOURCE_ASSESSMENTS, officialAustraliaSearchUrl } from '../../src/markets/australia-sources.js';
import { CANADA_SOURCE_ASSESSMENTS, officialCanadaSearchUrl } from '../../src/markets/canada-sources.js';
import { COUNTRY_REGISTRY, normaliseLocation } from '../../src/markets/countries.js';
import { EMPLOYER_TARGETS, employerTargetRecord, verifyTargetDiscovery } from '../../src/markets/employers.js';
import { GERMANY_SOURCE_ASSESSMENTS, officialGermanySearchUrl } from '../../src/markets/germany-sources.js';
import { INDIA_SOURCE_ASSESSMENTS, officialIndiaSearchUrl } from '../../src/markets/india-sources.js';
import { JAPAN_SOURCE_ASSESSMENTS, officialJapanSearchUrl } from '../../src/markets/japan-sources.js';
import { marketReadiness } from '../../src/markets/readiness.js';
import { officialSingaporeSearchUrl, SINGAPORE_SOURCE_ASSESSMENTS } from '../../src/markets/singapore-sources.js';
import { officialUaeSearchUrl, UAE_SOURCE_ASSESSMENTS } from '../../src/markets/uae-sources.js';
import { officialUkSearchUrl, UK_SOURCE_ASSESSMENTS } from '../../src/markets/uk-sources.js';
import { capabilityForName } from '../../src/sources/capabilities.js';
import { marketFacts } from '../../src/sources/normalize.js';
import type { SourceAdapter } from '../../src/sources/types.js';
import { openDb } from '../../src/store/db.js';
import { tempDir } from '../helpers.js';

describe('configured markets', () => {
  it('configures the agreed rollout markets without claiming discovery availability', () => {
    expect(Object.keys(COUNTRY_REGISTRY)).toEqual([
      'DE',
      'IN',
      'SG',
      'MY',
      'ID',
      'PH',
      'TH',
      'VN',
      'AE',
      'JP',
      'GB',
      'AU',
      'CA',
      'HR',
    ]);
    expect(Object.values(COUNTRY_REGISTRY).every((country) => country.status === 'CONFIGURED')).toBe(true);
    expect(COUNTRY_REGISTRY.IN.defaultCities).toContain('Bengaluru');
    expect(COUNTRY_REGISTRY.VN.currencies).toEqual(['VND']);
    expect(COUNTRY_REGISTRY.AE.currencies).toEqual(['AED']);
    expect(COUNTRY_REGISTRY.JP.currencies).toEqual(['JPY']);
    expect(COUNTRY_REGISTRY.GB.currencies).toEqual(['GBP']);
    expect(COUNTRY_REGISTRY.AU.currencies).toEqual(['AUD']);
    expect(COUNTRY_REGISTRY.CA.currencies).toEqual(['CAD']);
    expect(EMPLOYER_TARGETS.map((target) => `${target.source}/${target.board}`)).toEqual([
      'lever/saviynt',
      'greenhouse/kraftonindia',
      'ashby/sarvam',
      'ashby/harvey',
      'greenhouse/stripe',
      'greenhouse/databricks',
      'greenhouse/coinbase',
      'greenhouse/twilio',
      'greenhouse/hellofresh',
      'greenhouse/doctolib',
      'greenhouse/celonis',
      'greenhouse/sumup',
      'lever/ninjavan',
      'greenhouse/agoda',
      'greenhouse/xendit',
      'greenhouse/avepoint',
      'greenhouse/mitsogoinc',
      'lever/amanotes',
      'ashby/skymavis',
      'greenhouse/bybit',
      'greenhouse/deliveroo',
      'ashby/ziina',
      'ashby/checkout.com',
      'ashby/openai',
      'greenhouse/anthropic',
      'greenhouse/newrelic',
      'greenhouse/figma',
      'greenhouse/monzo',
      'ashby/wayve',
      'ashby/elevenlabs',
      'ashby/synthesia',
      'greenhouse/cultureamp',
      'lever/mable',
      'lever/deputy',
      'lever/immutable',
      'ashby/1password',
      'ashby/wealthsimple',
      'ashby/jane',
      'ashby/trulioo',
    ]);
  });

  it('normalises only configured, evidence-bearing country and city spellings', () => {
    expect(normaliseLocation('Bangalore, India')).toEqual({
      countryCode: 'IN',
      city: 'Bengaluru',
      originalText: 'Bangalore, India',
    });
    expect(normaliseLocation('München, Germany')).toEqual({
      countryCode: 'DE',
      city: 'Munich',
      originalText: 'München, Germany',
    });
    expect(normaliseLocation('Dubai, United Arab Emirates')).toEqual({
      countryCode: 'AE',
      city: 'Dubai',
      originalText: 'Dubai, United Arab Emirates',
    });
    expect(normaliseLocation('Abu Dhabi, UAE; APAC - Remote').countryCode).toBe('AE');
    expect(normaliseLocation('Tokyo, Japan')).toEqual({
      countryCode: 'JP',
      city: 'Tokyo',
      originalText: 'Tokyo, Japan',
    });
    expect(normaliseLocation('London, England')).toEqual({
      countryCode: 'GB',
      city: 'London',
      originalText: 'London, England',
    });
    expect(normaliseLocation('Cardiff, London or Remote (UK)').countryCode).toBe('GB');
    expect(normaliseLocation('Melbourne, Australia')).toEqual({
      countryCode: 'AU',
      city: 'Melbourne',
      originalText: 'Melbourne, Australia',
    });
    expect(normaliseLocation('Montréal, Canada')).toEqual({
      countryCode: 'CA',
      city: 'Montreal',
      originalText: 'Montréal, Canada',
    });
    expect(normaliseLocation('Remote (United States | Canada)').countryCode).toBe('CA');
    expect(normaliseLocation('Remote, APAC')).toEqual({ countryCode: null, city: null, originalText: 'Remote, APAC' });
  });

  it('keeps remote eligibility and source capability honest', () => {
    expect(marketFacts('Remote', 'remote')).toMatchObject({
      remoteEligibility: 'unknown',
      remoteEligibleCountries: [],
      visaSponsorship: 'unknown',
    });
    expect(capabilityForName('greenhouse')).toBe('AUTHORIZED_EMPLOYER_DIRECT');
    expect(capabilityForName('manual')).toBe('USER_DRIVEN_DISCOVERY');
    expect(capabilityForName('unreviewed-marketplace')).toBe('UNVERIFIED');
  });

  it('does not turn German marketplaces into automatic integrations', () => {
    expect(GERMANY_SOURCE_ASSESSMENTS.every((source) => source.automatedRetrieval === false)).toBe(true);
    expect(GERMANY_SOURCE_ASSESSMENTS.find((source) => source.id === 'bundesagentur')?.capability).toBe(
      'USER_DRIVEN_DISCOVERY',
    );
    const linkedin = GERMANY_SOURCE_ASSESSMENTS.find((source) => source.id === 'linkedin-jobs')!;
    const indeed = GERMANY_SOURCE_ASSESSMENTS.find((source) => source.id === 'indeed-germany')!;
    expect(officialGermanySearchUrl(linkedin, 'iOS Swift')).toContain('keywords=iOS+Swift');
    expect(officialGermanySearchUrl(linkedin, 'iOS Swift')).toContain('location=Germany');
    expect(officialGermanySearchUrl(indeed, 'iOS Swift')).toContain('q=iOS+Swift');
    expect(officialGermanySearchUrl(indeed, 'iOS Swift')).toContain('l=Germany');
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

  it('does not turn Singaporean marketplaces into automatic integrations', () => {
    expect(SINGAPORE_SOURCE_ASSESSMENTS.every((source) => source.automatedRetrieval === false)).toBe(true);
    expect(SINGAPORE_SOURCE_ASSESSMENTS.find((source) => source.id === 'mycareersfuture')?.capability).toBe(
      'USER_DRIVEN_DISCOVERY',
    );
    const linkedin = SINGAPORE_SOURCE_ASSESSMENTS.find((source) => source.id === 'linkedin-jobs')!;
    const indeed = SINGAPORE_SOURCE_ASSESSMENTS.find((source) => source.id === 'indeed-singapore')!;
    expect(officialSingaporeSearchUrl(linkedin, 'iOS Swift')).toContain('keywords=iOS+Swift');
    expect(officialSingaporeSearchUrl(linkedin, 'iOS Swift')).toContain('location=Singapore');
    expect(officialSingaporeSearchUrl(indeed, 'iOS Swift')).toContain('q=iOS+Swift');
    expect(officialSingaporeSearchUrl(indeed, 'iOS Swift')).toContain('l=Singapore');
  });

  it('does not turn Emirati marketplaces into automatic integrations', () => {
    expect(UAE_SOURCE_ASSESSMENTS.every((source) => source.automatedRetrieval === false)).toBe(true);
    expect(UAE_SOURCE_ASSESSMENTS.find((source) => source.id === 'dubaicareers')?.capability).toBe(
      'USER_DRIVEN_DISCOVERY',
    );
    const linkedin = UAE_SOURCE_ASSESSMENTS.find((source) => source.id === 'linkedin-jobs')!;
    const indeed = UAE_SOURCE_ASSESSMENTS.find((source) => source.id === 'indeed-uae')!;
    expect(officialUaeSearchUrl(linkedin, 'iOS Swift')).toContain('keywords=iOS+Swift');
    expect(officialUaeSearchUrl(linkedin, 'iOS Swift')).toContain('location=United+Arab+Emirates');
    expect(officialUaeSearchUrl(indeed, 'iOS Swift')).toContain('q=iOS+Swift');
    expect(officialUaeSearchUrl(indeed, 'iOS Swift')).toContain('l=United+Arab+Emirates');
  });

  it('does not turn Japanese marketplaces into automatic integrations', () => {
    expect(JAPAN_SOURCE_ASSESSMENTS.every((source) => source.automatedRetrieval === false)).toBe(true);
    expect(JAPAN_SOURCE_ASSESSMENTS.find((source) => source.id === 'hello-work')?.capability).toBe(
      'USER_DRIVEN_DISCOVERY',
    );
    const linkedin = JAPAN_SOURCE_ASSESSMENTS.find((source) => source.id === 'linkedin-jobs')!;
    const indeed = JAPAN_SOURCE_ASSESSMENTS.find((source) => source.id === 'indeed-japan')!;
    expect(officialJapanSearchUrl(linkedin, 'iOS Swift')).toContain('keywords=iOS+Swift');
    expect(officialJapanSearchUrl(linkedin, 'iOS Swift')).toContain('location=Japan');
    expect(officialJapanSearchUrl(indeed, 'iOS Swift')).toContain('q=iOS+Swift');
    expect(officialJapanSearchUrl(indeed, 'iOS Swift')).toContain('l=Japan');
  });

  it('does not turn British marketplaces into automatic integrations', () => {
    expect(UK_SOURCE_ASSESSMENTS.every((source) => source.automatedRetrieval === false)).toBe(true);
    expect(UK_SOURCE_ASSESSMENTS.find((source) => source.id === 'find-a-job')?.capability).toBe(
      'USER_DRIVEN_DISCOVERY',
    );
    const linkedin = UK_SOURCE_ASSESSMENTS.find((source) => source.id === 'linkedin-jobs')!;
    const indeed = UK_SOURCE_ASSESSMENTS.find((source) => source.id === 'indeed-uk')!;
    expect(officialUkSearchUrl(linkedin, 'iOS Swift')).toContain('keywords=iOS+Swift');
    expect(officialUkSearchUrl(linkedin, 'iOS Swift')).toContain('location=United+Kingdom');
    expect(officialUkSearchUrl(indeed, 'iOS Swift')).toContain('q=iOS+Swift');
    expect(officialUkSearchUrl(indeed, 'iOS Swift')).toContain('l=United+Kingdom');
  });

  it('does not turn Australian marketplaces into automatic integrations', () => {
    expect(AUSTRALIA_SOURCE_ASSESSMENTS.every((source) => source.automatedRetrieval === false)).toBe(true);
    expect(AUSTRALIA_SOURCE_ASSESSMENTS.find((source) => source.id === 'workforce-australia')?.capability).toBe(
      'USER_DRIVEN_DISCOVERY',
    );
    const linkedin = AUSTRALIA_SOURCE_ASSESSMENTS.find((source) => source.id === 'linkedin-jobs')!;
    const indeed = AUSTRALIA_SOURCE_ASSESSMENTS.find((source) => source.id === 'indeed-australia')!;
    expect(officialAustraliaSearchUrl(linkedin, 'iOS Swift')).toContain('keywords=iOS+Swift');
    expect(officialAustraliaSearchUrl(linkedin, 'iOS Swift')).toContain('location=Australia');
    expect(officialAustraliaSearchUrl(indeed, 'iOS Swift')).toContain('q=iOS+Swift');
    expect(officialAustraliaSearchUrl(indeed, 'iOS Swift')).toContain('l=Australia');
  });

  it('does not turn Canadian marketplaces into automatic integrations', () => {
    expect(CANADA_SOURCE_ASSESSMENTS.every((source) => source.automatedRetrieval === false)).toBe(true);
    expect(CANADA_SOURCE_ASSESSMENTS.find((source) => source.id === 'job-bank')?.capability).toBe(
      'USER_DRIVEN_DISCOVERY',
    );
    const linkedin = CANADA_SOURCE_ASSESSMENTS.find((source) => source.id === 'linkedin-jobs')!;
    const indeed = CANADA_SOURCE_ASSESSMENTS.find((source) => source.id === 'indeed-canada')!;
    expect(officialCanadaSearchUrl(linkedin, 'iOS Swift')).toContain('keywords=iOS+Swift');
    expect(officialCanadaSearchUrl(linkedin, 'iOS Swift')).toContain('location=Canada');
    expect(officialCanadaSearchUrl(indeed, 'iOS Swift')).toContain('q=iOS+Swift');
    expect(officialCanadaSearchUrl(indeed, 'iOS Swift')).toContain('l=Canada');
  });

  it('requires an actual permitted response with explicit India evidence before certifying discovery', async () => {
    const target = EMPLOYER_TARGETS[0]!;
    const adapter: SourceAdapter = {
      id: 'lever',
      label: 'test',
      boardUrl: () => 'https://jobs.lever.co/saviynt',
      list: async () => [
        {
          source: 'lever',
          board: 'saviynt',
          sourceJobId: '1',
          employer: 'Saviynt',
          title: 'Engineer',
          locationText: 'Bengaluru, India',
          remotePolicy: 'onsite',
          employmentType: 'full_time',
          department: null,
          salary: null,
          description: [],
          applyUrl: null,
          postingUrl: null,
          publishedAt: null,
          unresolved: [],
        },
      ],
    };
    const verified = await verifyTargetDiscovery(target, adapter, 'IN', new Date('2026-10-31T12:00:00.000Z'));
    expect(verified.countryPostings).toHaveLength(1);
    await expect(verifyTargetDiscovery(target, { ...adapter, list: async () => [] }, 'IN')).rejects.toThrow(
      'remains CONFIGURED',
    );
  });

  it('keeps registry retrieval timestamps empty until the board is actually adopted', () => {
    const db = openDb(path.join(tempDir('cs-market-target-'), 'cs.db'));
    expect(employerTargetRecord(db, EMPLOYER_TARGETS[0]!)).toMatchObject({
      monitoringState: 'NOT_ADOPTED',
      lastSuccessfulRetrievalAt: null,
      lastVerificationAt: '2026-10-31T00:00:00.000Z',
    });
  });

  it('reports market readiness from local board health, never from configuration alone', () => {
    const db = openDb(path.join(tempDir('cs-market-readiness-'), 'cs.db'));
    const before = marketReadiness(db);
    expect(before.map((m) => m.code)).toEqual([
      'DE',
      'IN',
      'SG',
      'MY',
      'ID',
      'PH',
      'TH',
      'VN',
      'AE',
      'JP',
      'GB',
      'AU',
      'CA',
      'HR',
    ]);
    const india = before.find((m) => m.code === 'IN')!;
    expect(india).toMatchObject({ name: 'India', configuredStatus: 'CONFIGURED', discoveryAvailable: false });
    expect(india.targets.map((t) => t.id)).toEqual(['saviynt-india', 'krafton-india', 'sarvam-india', 'harvey-india']);
    expect(india.targets.every((t) => t.monitoringState === 'NOT_ADOPTED')).toBe(true);
    // Markets whose curated targets have not been adopted locally claim no signals either.
    const singapore = before.find((m) => m.code === 'SG')!;
    expect(singapore.discoveryAvailable).toBe(false);
    expect(singapore.targets.map((t) => t.id)).toEqual([
      'stripe-singapore',
      'databricks-singapore',
      'coinbase-singapore',
      'twilio-singapore',
    ]);
    expect(singapore.targets.every((t) => t.monitoringState === 'NOT_ADOPTED')).toBe(true);
    // Germany and the Southeast Asian markets now list curated targets of their own; none of them
    // is adopted in a fresh installation, so none claims local discovery signals.
    const germany = before.find((m) => m.code === 'DE')!;
    expect(germany.targets.map((t) => t.id)).toEqual(['hellofresh-de', 'doctolib-de', 'celonis-de', 'sumup-de']);
    const malaysia = before.find((m) => m.code === 'MY')!;
    expect(malaysia.targets.map((t) => t.id)).toEqual(['ninjavan-sea', 'agoda-careers', 'xendit-sea']);
    // The Philippines and Vietnam combine the shared regional boards with dedicated boards of
    // their own; none of them is adopted in a fresh installation, so none claims local signals.
    expect(before.find((m) => m.code === 'PH')!.targets.map((t) => t.id)).toEqual([
      'ninjavan-sea',
      'agoda-careers',
      'xendit-sea',
      'avepoint-ph',
      'mitsogo-ph',
    ]);
    expect(before.find((m) => m.code === 'VN')!.targets.map((t) => t.id)).toEqual([
      'ninjavan-sea',
      'agoda-careers',
      'amanotes-vn',
      'skymavis-vn',
    ]);
    // The United Arab Emirates has dedicated boards of its own; none is adopted in a fresh
    // installation, so it claims no local discovery signals either.
    const uae = before.find((m) => m.code === 'AE')!;
    expect(uae).toMatchObject({
      name: 'United Arab Emirates',
      configuredStatus: 'CONFIGURED',
      discoveryAvailable: false,
    });
    expect(uae.targets.map((t) => t.id)).toEqual(['bybit-uae', 'deliveroo-uae', 'ziina-uae', 'checkout-uae']);
    // Japan, the United Kingdom, Australia and Canada also have dedicated boards of their own;
    // none is adopted in a fresh installation, so none claims local discovery signals.
    expect(before.find((m) => m.code === 'JP')!.targets.map((t) => t.id)).toEqual([
      'openai-jp',
      'anthropic-jp',
      'newrelic-jp',
      'figma-jp',
    ]);
    expect(before.find((m) => m.code === 'GB')!.targets.map((t) => t.id)).toEqual([
      'monzo-gb',
      'wayve-gb',
      'elevenlabs-gb',
      'synthesia-gb',
    ]);
    expect(before.find((m) => m.code === 'AU')!.targets.map((t) => t.id)).toEqual([
      'cultureamp-au',
      'mable-au',
      'deputy-au',
      'immutable-au',
    ]);
    expect(before.find((m) => m.code === 'CA')!.targets.map((t) => t.id)).toEqual([
      '1password-ca',
      'wealthsimple-ca',
      'jane-ca',
      'trulioo-ca',
    ]);
    for (const code of ['DE', 'MY', 'ID', 'PH', 'TH', 'VN', 'AE', 'JP', 'GB', 'AU', 'CA'] as const) {
      expect(before.find((m) => m.code === code)!.targets.every((t) => t.monitoringState === 'NOT_ADOPTED')).toBe(true);
    }

    // A healthy adopted board — as verify-market or a monitored fetch would record — is the only
    // local evidence that turns discovery availability on for one market.
    db.prepare(
      "INSERT INTO source_boards (id, source, board, added_at, health, last_success_at) VALUES ('b1', 'ashby', 'sarvam', '2026-10-31T12:00:00.000Z', 'OK', '2026-10-31T12:00:00.000Z')",
    ).run();
    const after = marketReadiness(db).find((m) => m.code === 'IN')!;
    expect(after.discoveryAvailable).toBe(true);
    expect(after.targets.find((t) => t.id === 'sarvam-india')).toMatchObject({
      monitoringState: 'HEALTHY',
      lastSuccessfulRetrievalAt: '2026-10-31T12:00:00.000Z',
    });
    expect(after.targets.find((t) => t.id === 'saviynt-india')!.monitoringState).toBe('NOT_ADOPTED');
    expect(marketReadiness(db).find((m) => m.code === 'DE')!.discoveryAvailable).toBe(false);
  });
});
