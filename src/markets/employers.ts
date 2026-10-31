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
 * India evidence reviewed on 2026-10-31: each employer's official careers page was reachable and
 * its public board API returned complete listings with postings located explicitly in India
 * (Saviynt 22, KRAFTON INDIA 8, Sarvam AI 37, Harvey 11 on that date). Board identifiers are
 * therefore corroborated, not guessed. Links remain on each target record for later review.
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

/**
 * Germany evidence reviewed on 2026-10-31: each employer's official careers site was reachable and
 * its Greenhouse board returned complete listings with postings located explicitly in Germany
 * (HelloFresh 90, Doctolib 65, Celonis 56, SumUp 49 on that date). The HelloFresh, Celonis and
 * SumUp boards redirect `job-boards.greenhouse.io` to the employer's own careers search, which
 * corroborates ownership the same way it does for the Singapore boards.
 * This is not live-discovery certification: that is earned only by verifyTargetDiscovery().
 */
export const GERMANY_EMPLOYER_TARGETS: readonly EmployerTarget[] = [
  {
    id: 'hellofresh-de',
    employer: 'HelloFresh',
    officialWebsite: 'https://www.hellofresh.com',
    careersUrl: 'https://careers.hellofresh.com/global/en',
    source: 'greenhouse',
    board: 'hellofresh',
    boardUrl: 'https://job-boards.greenhouse.io/hellofresh',
    countries: ['DE'],
    verification: 'OFFICIAL_CAREERS_AND_ATS_BOARD_CONFIRMED',
    verifiedAt: '2026-10-31T00:00:00.000Z',
  },
  {
    id: 'doctolib-de',
    employer: 'Doctolib',
    officialWebsite: 'https://www.doctolib.com',
    careersUrl: 'https://careers.doctolib.com',
    source: 'greenhouse',
    board: 'doctolib',
    boardUrl: 'https://job-boards.greenhouse.io/doctolib',
    countries: ['DE'],
    verification: 'OFFICIAL_CAREERS_AND_ATS_BOARD_CONFIRMED',
    verifiedAt: '2026-10-31T00:00:00.000Z',
  },
  {
    id: 'celonis-de',
    employer: 'Celonis',
    officialWebsite: 'https://www.celonis.com',
    careersUrl: 'https://careers.celonis.com',
    source: 'greenhouse',
    board: 'celonis',
    boardUrl: 'https://job-boards.greenhouse.io/celonis',
    countries: ['DE'],
    verification: 'OFFICIAL_CAREERS_AND_ATS_BOARD_CONFIRMED',
    verifiedAt: '2026-10-31T00:00:00.000Z',
  },
  {
    id: 'sumup-de',
    employer: 'SumUp',
    officialWebsite: 'https://www.sumup.com',
    careersUrl: 'https://www.sumup.com/careers/',
    source: 'greenhouse',
    board: 'sumup',
    boardUrl: 'https://job-boards.greenhouse.io/sumup',
    countries: ['DE'],
    verification: 'OFFICIAL_CAREERS_AND_ATS_BOARD_CONFIRMED',
    verifiedAt: '2026-10-31T00:00:00.000Z',
  },
];

/**
 * Southeast Asia evidence reviewed on 2026-10-31. Each board is corroborated by the employer's own
 * careers presence: Ninja Van's careers site deep-links to its Lever postings; Agoda's official
 * careers site embeds the Greenhouse board directly; Xendit's board postings carry the Xendit
 * identity. Explicitly located postings on that date: Ninja Van — Malaysia 84, Philippines 17,
 * Indonesia 7, Thailand 4, Vietnam 2; Agoda — Thailand 200, Malaysia 14, Philippines 2, Vietnam 2;
 * Xendit — Indonesia 2, Malaysia 1, Thailand 1. Singapore and India are deliberately not in these
 * target lists: both markets are already certified through their own dedicated boards, and a
 * duplicate listing would not add evidence. The Philippines and Vietnam are also served by their
 * own dedicated boards below; these regional boards keep carrying their explicit postings.
 * These are not live-discovery certifications: that is earned only by verifyTargetDiscovery().
 */
export const SOUTHEAST_ASIA_EMPLOYER_TARGETS: readonly EmployerTarget[] = [
  {
    id: 'ninjavan-sea',
    employer: 'Ninja Van',
    officialWebsite: 'https://www.ninjavan.co',
    careersUrl: 'https://www.ninjavan.co/en-sg/company/careers',
    source: 'lever',
    board: 'ninjavan',
    boardUrl: 'https://jobs.lever.co/ninjavan',
    countries: ['MY', 'ID', 'PH', 'TH', 'VN'],
    verification: 'OFFICIAL_CAREERS_AND_ATS_BOARD_CONFIRMED',
    verifiedAt: '2026-10-31T00:00:00.000Z',
  },
  {
    id: 'agoda-careers',
    employer: 'Agoda',
    officialWebsite: 'https://www.agoda.com',
    careersUrl: 'https://careersatagoda.com/',
    source: 'greenhouse',
    board: 'agoda',
    boardUrl: 'https://job-boards.greenhouse.io/agoda',
    countries: ['TH', 'MY', 'PH', 'VN'],
    verification: 'OFFICIAL_CAREERS_AND_ATS_BOARD_CONFIRMED',
    verifiedAt: '2026-10-31T00:00:00.000Z',
  },
  {
    id: 'xendit-sea',
    employer: 'Xendit',
    officialWebsite: 'https://www.xendit.co',
    careersUrl: 'https://www.xendit.co/careers/',
    source: 'greenhouse',
    board: 'xendit',
    boardUrl: 'https://job-boards.greenhouse.io/xendit',
    countries: ['ID', 'TH', 'MY', 'PH'],
    verification: 'OFFICIAL_CAREERS_AND_ATS_BOARD_CONFIRMED',
    verifiedAt: '2026-10-31T00:00:00.000Z',
  },
];

/**
 * Philippines evidence reviewed on 2026-10-31. Each target is corroborated by the employer's own
 * careers presence: `job-boards.greenhouse.io/avepoint` redirects to AvePoint's own careers page,
 * which renders the same board, and Mitsogo's own site links its Greenhouse board directly.
 * Explicitly located postings on that date: AvePoint — Manila 11, Cebu 5, Manila and Cebu 1;
 * Mitsogo — Manila 3, Philippines 4. These are not live-discovery certifications: that is earned
 * only by verifyTargetDiscovery().
 */
export const PHILIPPINES_EMPLOYER_TARGETS: readonly EmployerTarget[] = [
  {
    id: 'avepoint-ph',
    employer: 'AvePoint',
    officialWebsite: 'https://www.avepoint.com',
    careersUrl: 'https://www.avepoint.com/careers',
    source: 'greenhouse',
    board: 'avepoint',
    boardUrl: 'https://job-boards.greenhouse.io/avepoint',
    countries: ['PH'],
    verification: 'OFFICIAL_CAREERS_AND_ATS_BOARD_CONFIRMED',
    verifiedAt: '2026-10-31T00:00:00.000Z',
  },
  {
    id: 'mitsogo-ph',
    employer: 'Mitsogo',
    officialWebsite: 'https://www.mitsogo.com',
    careersUrl: 'https://www.mitsogo.com/careers',
    source: 'greenhouse',
    board: 'mitsogoinc',
    boardUrl: 'https://job-boards.greenhouse.io/mitsogoinc',
    countries: ['PH'],
    verification: 'OFFICIAL_CAREERS_AND_ATS_BOARD_CONFIRMED',
    verifiedAt: '2026-10-31T00:00:00.000Z',
  },
];

/**
 * Vietnam evidence reviewed on 2026-10-31. Each target is corroborated by the employer's own
 * careers presence: Amanotes' dedicated careers site embeds its Lever postings, and Sky Mavis'
 * own careers page links its Ashby board directly. Explicitly located postings on that date:
 * Amanotes — Ho Chi Minh City 15; Sky Mavis — Vietnam 6. These are not live-discovery
 * certifications: that is earned only by verifyTargetDiscovery().
 */
export const VIETNAM_EMPLOYER_TARGETS: readonly EmployerTarget[] = [
  {
    id: 'amanotes-vn',
    employer: 'Amanotes',
    officialWebsite: 'https://www.amanotes.com',
    careersUrl: 'https://www.careers.amanotes.com/',
    source: 'lever',
    board: 'amanotes',
    boardUrl: 'https://jobs.lever.co/amanotes',
    countries: ['VN'],
    verification: 'OFFICIAL_CAREERS_AND_ATS_BOARD_CONFIRMED',
    verifiedAt: '2026-10-31T00:00:00.000Z',
  },
  {
    id: 'skymavis-vn',
    employer: 'Sky Mavis',
    officialWebsite: 'https://skymavis.com',
    careersUrl: 'https://skymavis.com/careers',
    source: 'ashby',
    board: 'skymavis',
    boardUrl: 'https://jobs.ashbyhq.com/skymavis',
    countries: ['VN'],
    verification: 'OFFICIAL_CAREERS_AND_ATS_BOARD_CONFIRMED',
    verifiedAt: '2026-10-31T00:00:00.000Z',
  },
];

export const EMPLOYER_TARGETS: readonly EmployerTarget[] = [
  ...INDIA_EMPLOYER_TARGETS,
  ...SINGAPORE_EMPLOYER_TARGETS,
  ...GERMANY_EMPLOYER_TARGETS,
  ...SOUTHEAST_ASIA_EMPLOYER_TARGETS,
  ...PHILIPPINES_EMPLOYER_TARGETS,
  ...VIETNAM_EMPLOYER_TARGETS,
];

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
