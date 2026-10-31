import type { SourceCapability } from '../sources/capabilities.js';

/**
 * Canada marketplace policy. These records describe what Career Strike may claim and do today;
 * they are not adapters and therefore cannot turn a named site into automatic coverage.
 */
export interface CanadaSourceAssessment {
  id: string;
  name: string;
  capability: SourceCapability;
  automatedRetrieval: false;
  permittedUserAction: 'open_official_site' | 'supply_official_listing';
  officialUrl: string;
  reviewUrl: string;
  rationale: string;
}

export const CANADA_SOURCE_ASSESSMENTS: readonly CanadaSourceAssessment[] = [
  {
    id: 'job-bank', name: 'Job Bank', capability: 'USER_DRIVEN_DISCOVERY', automatedRetrieval: false,
    permittedUserAction: 'open_official_site', officialUrl: 'https://www.jobbank.gc.ca/home', reviewUrl: 'https://www.jobbank.gc.ca/home',
    rationale: 'Official job board of the Government of Canada; no public Career Strike integration or access grant is recorded.',
  },
  {
    id: 'linkedin-jobs', name: 'LinkedIn Jobs', capability: 'RESTRICTED', automatedRetrieval: false,
    permittedUserAction: 'open_official_site', officialUrl: 'https://www.linkedin.com/jobs/', reviewUrl: 'https://www.linkedin.com/legal/jobs-terms-conditions',
    rationale: 'Automated scraping or extraction needs LinkedIn’s express written authorisation.',
  },
  {
    id: 'indeed-canada', name: 'Indeed Canada', capability: 'UNVERIFIED', automatedRetrieval: false,
    permittedUserAction: 'open_official_site', officialUrl: 'https://ca.indeed.com/', reviewUrl: 'https://docs.indeed.com/legal-terms/developer-agreement',
    rationale: 'Partner API terms exist, but Career Strike has no approved integration or recorded access grant.',
  },
  {
    id: 'jobillico', name: 'Jobillico', capability: 'UNVERIFIED', automatedRetrieval: false,
    permittedUserAction: 'open_official_site', officialUrl: 'https://www.jobillico.com/', reviewUrl: 'https://www.jobillico.com/',
    rationale: 'No permitted programmatic access has been verified for Career Strike.',
  },
];

/** Opens a provider's own search UI. Query text is never sent to Career Strike's server. */
export function officialCanadaSearchUrl(source: CanadaSourceAssessment, query: string): string {
  const keywords = query.trim();
  if (source.id === 'linkedin-jobs') {
    const url = new URL('https://www.linkedin.com/jobs/search/');
    if (keywords) url.searchParams.set('keywords', keywords);
    url.searchParams.set('location', 'Canada');
    return url.toString();
  }
  if (source.id === 'indeed-canada') {
    const url = new URL('https://ca.indeed.com/jobs');
    if (keywords) url.searchParams.set('q', keywords);
    url.searchParams.set('l', 'Canada');
    return url.toString();
  }
  return source.officialUrl;
}
