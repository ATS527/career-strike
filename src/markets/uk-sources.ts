import type { SourceCapability } from '../sources/capabilities.js';

/**
 * United Kingdom marketplace policy. These records describe what Career Strike may claim and do
 * today; they are not adapters and therefore cannot turn a named site into automatic coverage.
 */
export interface UkSourceAssessment {
  id: string;
  name: string;
  capability: SourceCapability;
  automatedRetrieval: false;
  permittedUserAction: 'open_official_site' | 'supply_official_listing';
  officialUrl: string;
  reviewUrl: string;
  rationale: string;
}

export const UK_SOURCE_ASSESSMENTS: readonly UkSourceAssessment[] = [
  {
    id: 'find-a-job', name: 'Find a job', capability: 'USER_DRIVEN_DISCOVERY', automatedRetrieval: false,
    permittedUserAction: 'open_official_site', officialUrl: 'https://www.jobs.service.gov.uk/', reviewUrl: 'https://www.jobs.service.gov.uk/',
    rationale: 'Official job-search service run by the Department for Work and Pensions; no public Career Strike integration or access grant is recorded.',
  },
  {
    id: 'linkedin-jobs', name: 'LinkedIn Jobs', capability: 'RESTRICTED', automatedRetrieval: false,
    permittedUserAction: 'open_official_site', officialUrl: 'https://www.linkedin.com/jobs/', reviewUrl: 'https://www.linkedin.com/legal/jobs-terms-conditions',
    rationale: 'Automated scraping or extraction needs LinkedIn’s express written authorisation.',
  },
  {
    id: 'indeed-uk', name: 'Indeed UK', capability: 'UNVERIFIED', automatedRetrieval: false,
    permittedUserAction: 'open_official_site', officialUrl: 'https://uk.indeed.com/', reviewUrl: 'https://docs.indeed.com/legal-terms/developer-agreement',
    rationale: 'Partner API terms exist, but Career Strike has no approved integration or recorded access grant.',
  },
  {
    id: 'reed', name: 'Reed', capability: 'UNVERIFIED', automatedRetrieval: false,
    permittedUserAction: 'open_official_site', officialUrl: 'https://www.reed.co.uk/', reviewUrl: 'https://www.reed.co.uk/',
    rationale: 'No permitted programmatic access has been verified for Career Strike.',
  },
  {
    id: 'totaljobs', name: 'Totaljobs', capability: 'UNVERIFIED', automatedRetrieval: false,
    permittedUserAction: 'open_official_site', officialUrl: 'https://www.totaljobs.com/', reviewUrl: 'https://www.totaljobs.com/',
    rationale: 'No permitted programmatic access has been verified for Career Strike.',
  },
];

/** Opens a provider's own search UI. Query text is never sent to Career Strike's server. */
export function officialUkSearchUrl(source: UkSourceAssessment, query: string): string {
  const keywords = query.trim();
  if (source.id === 'linkedin-jobs') {
    const url = new URL('https://www.linkedin.com/jobs/search/');
    if (keywords) url.searchParams.set('keywords', keywords);
    url.searchParams.set('location', 'United Kingdom');
    return url.toString();
  }
  if (source.id === 'indeed-uk') {
    const url = new URL('https://uk.indeed.com/jobs');
    if (keywords) url.searchParams.set('q', keywords);
    url.searchParams.set('l', 'United Kingdom');
    return url.toString();
  }
  return source.officialUrl;
}
