import type { SourceCapability } from '../sources/capabilities.js';

/**
 * Germany marketplace policy. These records describe what Career Strike may claim and do
 * today; they are not adapters and therefore cannot turn a named site into automatic coverage.
 */
export interface GermanySourceAssessment {
  id: string;
  name: string;
  capability: SourceCapability;
  automatedRetrieval: false;
  permittedUserAction: 'open_official_site' | 'supply_official_listing';
  officialUrl: string;
  reviewUrl: string;
  rationale: string;
}

export const GERMANY_SOURCE_ASSESSMENTS: readonly GermanySourceAssessment[] = [
  {
    id: 'bundesagentur', name: 'Bundesagentur für Arbeit', capability: 'USER_DRIVEN_DISCOVERY', automatedRetrieval: false,
    permittedUserAction: 'open_official_site', officialUrl: 'https://www.arbeitsagentur.de/jobsuche/', reviewUrl: 'https://www.arbeitsagentur.de/jobsuche/',
    rationale: 'Official public job search run by the Federal Employment Agency; no public Career Strike integration or access grant is recorded.',
  },
  {
    id: 'linkedin-jobs', name: 'LinkedIn Jobs', capability: 'RESTRICTED', automatedRetrieval: false,
    permittedUserAction: 'open_official_site', officialUrl: 'https://www.linkedin.com/jobs/', reviewUrl: 'https://www.linkedin.com/legal/jobs-terms-conditions',
    rationale: 'Automated scraping or extraction needs LinkedIn’s express written authorisation.',
  },
  {
    id: 'indeed-germany', name: 'Indeed Deutschland', capability: 'UNVERIFIED', automatedRetrieval: false,
    permittedUserAction: 'open_official_site', officialUrl: 'https://de.indeed.com/', reviewUrl: 'https://docs.indeed.com/legal-terms/developer-agreement',
    rationale: 'Partner API terms exist, but Career Strike has no approved integration or recorded access grant.',
  },
  {
    id: 'stepstone', name: 'StepStone', capability: 'UNVERIFIED', automatedRetrieval: false,
    permittedUserAction: 'open_official_site', officialUrl: 'https://www.stepstone.de/', reviewUrl: 'https://www.stepstone.de/',
    rationale: 'No permitted programmatic access has been verified for Career Strike.',
  },
  {
    id: 'xing', name: 'Xing', capability: 'UNVERIFIED', automatedRetrieval: false,
    permittedUserAction: 'open_official_site', officialUrl: 'https://www.xing.com/jobs', reviewUrl: 'https://www.xing.com/jobs',
    rationale: 'No permitted programmatic access has been verified for Career Strike.',
  },
];

/** Opens a provider's own search UI. Query text is never sent to Career Strike's server. */
export function officialGermanySearchUrl(source: GermanySourceAssessment, query: string): string {
  const keywords = query.trim();
  if (source.id === 'linkedin-jobs') {
    const url = new URL('https://www.linkedin.com/jobs/search/');
    if (keywords) url.searchParams.set('keywords', keywords);
    url.searchParams.set('location', 'Germany');
    return url.toString();
  }
  if (source.id === 'indeed-germany') {
    const url = new URL('https://de.indeed.com/jobs');
    if (keywords) url.searchParams.set('q', keywords);
    url.searchParams.set('l', 'Germany');
    return url.toString();
  }
  return source.officialUrl;
}
