import type { SourceCapability } from '../sources/capabilities.js';

/**
 * Singapore marketplace policy. These records describe what Career Strike may claim and do today;
 * they are not adapters and therefore cannot turn a named site into automatic coverage.
 */
export interface SingaporeSourceAssessment {
  id: string;
  name: string;
  capability: SourceCapability;
  automatedRetrieval: false;
  permittedUserAction: 'open_official_site' | 'supply_official_listing';
  officialUrl: string;
  reviewUrl: string;
  rationale: string;
}

export const SINGAPORE_SOURCE_ASSESSMENTS: readonly SingaporeSourceAssessment[] = [
  {
    id: 'mycareersfuture', name: 'MyCareersFuture', capability: 'USER_DRIVEN_DISCOVERY', automatedRetrieval: false,
    permittedUserAction: 'open_official_site', officialUrl: 'https://www.mycareersfuture.gov.sg/', reviewUrl: 'https://www.mycareersfuture.gov.sg/',
    rationale: 'Official government portal run with Workforce Singapore; no public Career Strike job-search integration or access grant is recorded.',
  },
  {
    id: 'linkedin-jobs', name: 'LinkedIn Jobs', capability: 'RESTRICTED', automatedRetrieval: false,
    permittedUserAction: 'open_official_site', officialUrl: 'https://www.linkedin.com/jobs/', reviewUrl: 'https://www.linkedin.com/legal/jobs-terms-conditions',
    rationale: 'Automated scraping or extraction needs LinkedIn’s express written authorisation.',
  },
  {
    id: 'indeed-singapore', name: 'Indeed Singapore', capability: 'UNVERIFIED', automatedRetrieval: false,
    permittedUserAction: 'open_official_site', officialUrl: 'https://sg.indeed.com/', reviewUrl: 'https://docs.indeed.com/legal-terms/developer-agreement',
    rationale: 'Partner API terms exist, but Career Strike has no approved integration or recorded access grant.',
  },
  {
    id: 'jobstreet-singapore', name: 'JobStreet Singapore', capability: 'UNVERIFIED', automatedRetrieval: false,
    permittedUserAction: 'open_official_site', officialUrl: 'https://www.jobstreet.com.sg/', reviewUrl: 'https://www.jobstreet.com.sg/',
    rationale: 'No permitted programmatic access has been verified for Career Strike.',
  },
  {
    id: 'glints', name: 'Glints', capability: 'UNVERIFIED', automatedRetrieval: false,
    permittedUserAction: 'open_official_site', officialUrl: 'https://glints.com/', reviewUrl: 'https://glints.com/',
    rationale: 'No permitted programmatic access has been verified for Career Strike.',
  },
];

/** Opens a provider's own search UI. Query text is never sent to Career Strike's server. */
export function officialSingaporeSearchUrl(source: SingaporeSourceAssessment, query: string): string {
  const keywords = query.trim();
  if (source.id === 'linkedin-jobs') {
    const url = new URL('https://www.linkedin.com/jobs/search/');
    if (keywords) url.searchParams.set('keywords', keywords);
    url.searchParams.set('location', 'Singapore');
    return url.toString();
  }
  if (source.id === 'indeed-singapore') {
    const url = new URL('https://sg.indeed.com/jobs');
    if (keywords) url.searchParams.set('q', keywords);
    url.searchParams.set('l', 'Singapore');
    return url.toString();
  }
  return source.officialUrl;
}
