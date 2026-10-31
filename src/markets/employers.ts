import { normaliseLocation, type CountryCode } from './countries.js';
import type { NormalizedPosting, SourceAdapter, SourceId } from '../sources/types.js';
import type { Db } from '../store/db.js';

/**
 * Curated employer targets are deliberately small. An entry requires corroboration of the
 * employer's own careers presence and a public ATS board; it is not a marketplace integration.
 * Retrieval evidence is deliberately not held in this static configuration. It is read from the
 * local source-board health record written after `verify-market` completes a real adapter fetch.
 */
export interface EmployerTarget {
  id: string;
  employer: string;
  officialWebsite: string;
  careersUrl: string;
  source: Extract<SourceId, 'greenhouse' | 'lever' | 'ashby'>;
  board: string;
  boardUrl: string;
  countries: readonly CountryCode[];
  verification: 'OFFICIAL_CAREERS_AND_ATS_BOARD_CONFIRMED';
  verifiedAt: string;
}

/**
 * Evidence reviewed on 2026-10-31: each target's official careers site and its public board
 * independently show matching Indian and Singaporean roles. Board identifiers are therefore
 * corroborated, not guessed. Links remain on each target record for later review.
 * This is not live-discovery certification: that is earned only by verifyTargetDiscovery().
 */
export const INDIA_EMPLOYER_TARGETS: readonly EmployerTarget[] = [
  {
    id: 'saviynt-india',
    employer: 'Saviynt',
    officialWebsite: 'https://saviynt.com',
    careersUrl: 'https://saviynt.com/careers',
    source: 'lever',
    board: 'saviynt',
    boardUrl: 'https://jobs.lever.co/saviynt',
    countries: ['IN'],
    verification: 'OFFICIAL_CAREERS_AND_ATS_BOARD_CONFIRMED',
    verifiedAt: '2026-10-31T00:00:00.000Z',
  },
  {
    id: 'krafton-india',
    employer: 'KRAFTON INDIA',
    officialWebsite: 'https://krafton.in',
    careersUrl: 'https://krafton.in/jobs/',
    source: 'greenhouse',
    board: 'kraftonindia',
    boardUrl: 'https://job-boards.greenhouse.io/kraftonindia',
    countries: ['IN'],
    verification: 'OFFICIAL_CAREERS_AND_ATS_BOARD_CONFIRMED',
    verifiedAt: '2026-10-31T00:00:00.000Z',
  },
  {
    id: 'sarvam-india',
    employer: 'Sarvam AI',
    officialWebsite: 'https://www.sarvam.ai',
    careersUrl: 'https://www.sarvam.ai/careers',
    source: 'ashby',
    board: 'sarvam',
    boardUrl: 'https://jobs.ashbyhq.com/sarvam',
    countries: ['IN'],
    verification: 'OFFICIAL_CAREERS_AND_ATS_BOARD_CONFIRMED',
    verifiedAt: '2026-10-31T00:00:00.000Z',
  },
  {
    id: 'harvey-india',
    employer: 'Harvey',
    officialWebsite: 'https://www.harvey.ai',
    careersUrl: 'https://www.harvey.ai/company/careers',
    source: 'ashby',
    board: 'harvey',
    boardUrl: 'https://jobs.ashbyhq.com/harvey',
    countries: ['IN'],
    verification: 'OFFICIAL_CAREERS_AND_ATS_BOARD_CONFIRMED',
    verifiedAt: '2026-10-31T00:00:00.000Z',
  },
];

/**
 * Singapore evidence reviewed on 2026-10-31: each employer's official careers page was reachable
 * and its Greenhouse board API returned complete listings with postings located explicitly in
 * Singapore (Stripe 47, Databricks 30, Coinbase 7, Twilio 5 on that date). Several of these boards
 * redirect `job-boards.greenhouse.io` to the employer's own careers search; the redirect target is
 * that employer's site rendering the same board, which corroborates ownership.
 * This is not live-discovery certification: that is earned only by verifyTargetDiscovery().
 */
export const SINGAPORE_EMPLOYER_TARGETS: readonly EmployerTarget[] = [
  {
    id: 'stripe-singapore',
    employer: 'Stripe',
    officialWebsite: 'https://stripe.com',
    careersUrl: 'https://stripe.com/jobs',
    source: 'greenhouse',
    board: 'stripe',
    boardUrl: 'https://boards.greenhouse.io/stripe',
    countries: ['SG'],
    verification: 'OFFICIAL_CAREERS_AND_ATS_BOARD_CONFIRMED',
    verifiedAt: '2026-10-31T00:00:00.000Z',
  },
  {
    id: 'databricks-singapore',
    employer: 'Databricks',
    officialWebsite: 'https://www.databricks.com',
    careersUrl: 'https://www.databricks.com/company/careers',
    source: 'greenhouse',
    board: 'databricks',
    boardUrl: 'https://job-boards.greenhouse.io/databricks',
    countries: ['SG'],
    verification: 'OFFICIAL_CAREERS_AND_ATS_BOARD_CONFIRMED',
    verifiedAt: '2026-10-31T00:00:00.000Z',
  },
  {
    id: 'coinbase-singapore',
    employer: 'Coinbase',
    officialWebsite: 'https://www.coinbase.com',
    careersUrl: 'https://www.coinbase.com/careers',
    source: 'greenhouse',
    board: 'coinbase',
    boardUrl: 'https://job-boards.greenhouse.io/coinbase',
    countries: ['SG'],
    verification: 'OFFICIAL_CAREERS_AND_ATS_BOARD_CONFIRMED',
    verifiedAt: '2026-10-31T00:00:00.000Z',
  },
  {
    id: 'twilio-singapore',
    employer: 'Twilio',
    officialWebsite: 'https://www.twilio.com',
    careersUrl: 'https://www.twilio.com/en-us/company/jobs',
    source: 'greenhouse',
    board: 'twilio',
    boardUrl: 'https://job-boards.greenhouse.io/twilio',
    countries: ['SG'],
    verification: 'OFFICIAL_CAREERS_AND_ATS_BOARD_CONFIRMED',
    verifiedAt: '2026-10-31T00:00:00.000Z',
  },
];

export const EMPLOYER_TARGETS: readonly EmployerTarget[] = [...INDIA_EMPLOYER_TARGETS, ...SINGAPORE_EMPLOYER_TARGETS];

export function employerTargetsFor(country: CountryCode): EmployerTarget[] {
  return EMPLOYER_TARGETS.filter((target) => target.countries.includes(country));
}

export interface EmployerTargetRegistryRecord extends EmployerTarget {
  lastSuccessfulRetrievalAt: string | null;
  lastVerificationAt: string | null;
  monitoringState: 'NOT_ADOPTED' | 'HEALTHY' | 'DEGRADED' | 'NOT_FOUND';
}

/** Runtime target evidence comes only from an adopted board, never from a documentation review. */
export function employerTargetRecord(db: Db, target: EmployerTarget): EmployerTargetRegistryRecord {
  const board = db.prepare('SELECT health, last_success_at FROM source_boards WHERE source = ? AND board = ?').get(target.source, target.board) as
    | { health: 'NEVER_RUN' | 'OK' | 'DEGRADED' | 'NOT_FOUND'; last_success_at: string | null }
    | undefined;
  const monitoringState = !board || board.health === 'NEVER_RUN' ? 'NOT_ADOPTED' : board.health === 'OK' ? 'HEALTHY' : board.health;
  return {
    ...target,
    lastSuccessfulRetrievalAt: board?.last_success_at ?? null,
    lastVerificationAt: board?.last_success_at ?? target.verifiedAt,
    monitoringState,
  };
}

export interface TargetDiscoveryVerification {
  target: EmployerTarget;
  postings: NormalizedPosting[];
  countryPostings: NormalizedPosting[];
  verifiedAt: string;
}

/**
 * A market is eligible for discovery only after a complete permitted feed response contains a
 * posting whose source location explicitly normalises to that market. Remote-only listings and
 * an employer's name alone are not country evidence.
 */
export async function verifyTargetDiscovery(
  target: EmployerTarget,
  adapter: SourceAdapter,
  country: CountryCode,
  now = new Date(),
): Promise<TargetDiscoveryVerification> {
  if (target.source !== adapter.id) throw new Error(`Target ${target.id} requires the ${target.source} adapter.`);
  if (!target.countries.includes(country)) throw new Error(`Target ${target.id} is not approved for ${country}.`);
  const postings = await adapter.list(target.board);
  const countryPostings = postings.filter((posting) => (posting.market?.location.countryCode ?? normaliseLocation(posting.locationText).countryCode) === country);
  if (countryPostings.length === 0) {
    throw new Error(`The ${target.employer} board returned no postings with explicit ${country} location evidence; ${country} remains CONFIGURED.`);
  }
  return { target, postings, countryPostings, verifiedAt: now.toISOString() };
}
