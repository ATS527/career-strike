import type { SourceCapability } from '../sources/capabilities.js';

/**
 * United Arab Emirates marketplace policy. These records describe what Career Strike may claim and
 * do today; they are not adapters and therefore cannot turn a named site into automatic coverage.
 */
export interface UaeSourceAssessment {
  id: string;
  name: string;
  capability: SourceCapability;
  automatedRetrieval: false;
  permittedUserAction: 'open_official_site' | 'supply_official_listing';
  officialUrl: string;
  reviewUrl: string;
  rationale: string;
}

export const UAE_SOURCE_ASSESSMENTS: readonly UaeSourceAssessment[] = [
  {
    id: 'dubaicareers', name: 'Dubai Careers', capability: 'USER_DRIVEN_DISCOVERY', automatedRetrieval: false,
    permittedUserAction: 'open_official_site', officialUrl: 'https://dubaicareers.ae/', reviewUrl: 'https://dubaicareers.ae/',
    rationale: 'Official Dubai Government careers portal; no public Career Strike job-search integration or access grant is recorded.',
  },
  {
    id: 'linkedin-jobs', name: 'LinkedIn Jobs', capability: 'RESTRICTED', automatedRetrieval: false,
    permittedUserAction: 'open_official_site', officialUrl: 'https://www.linkedin.com/jobs/', reviewUrl: 'https://www.linkedin.com/legal/jobs-terms-conditions',
    rationale: 'Automated scraping or extraction needs LinkedIn’s express written authorisation.',
  },
  {
    id: 'indeed-uae', name: 'Indeed UAE', capability: 'UNVERIFIED', automatedRetrieval: false,
    permittedUserAction: 'open_official_site', officialUrl: 'https://ae.indeed.com/', reviewUrl: 'https://docs.indeed.com/legal-terms/developer-agreement',
    rationale: 'Partner API terms exist, but Career Strike has no approved integration or recorded access grant.',
  },
  {
    id: 'bayt', name: 'Bayt', capability: 'UNVERIFIED', automatedRetrieval: false,
    permittedUserAction: 'open_official_site', officialUrl: 'https://www.bayt.com/', reviewUrl: 'https://www.bayt.com/',
    rationale: 'No permitted programmatic access has been verified for Career Strike.',
  },
  {
    id: 'gulftalent', name: 'GulfTalent', capability: 'UNVERIFIED', automatedRetrieval: false,
    permittedUserAction: 'open_official_site', officialUrl: 'https://www.gulftalent.com/', reviewUrl: 'https://www.gulftalent.com/',
    rationale: 'No permitted programmatic access has been verified for Career Strike.',
  },
  {
    id: 'naukrigulf', name: 'Naukrigulf', capability: 'UNVERIFIED', automatedRetrieval: false,
    permittedUserAction: 'open_official_site', officialUrl: 'https://www.naukrigulf.com/', reviewUrl: 'https://www.naukrigulf.com/',
    rationale: 'No permitted programmatic access has been verified for Career Strike.',
  },
];

/** Opens a provider's own search UI. Query text is never sent to Career Strike's server. */
export function officialUaeSearchUrl(source: UaeSourceAssessment, query: string): string {
  const keywords = query.trim();
  if (source.id === 'linkedin-jobs') {
    const url = new URL('https://www.linkedin.com/jobs/search/');
    if (keywords) url.searchParams.set('keywords', keywords);
    url.searchParams.set('location', 'United Arab Emirates');
    return url.toString();
  }
  if (source.id === 'indeed-uae') {
    const url = new URL('https://ae.indeed.com/jobs');
    if (keywords) url.searchParams.set('q', keywords);
    url.searchParams.set('l', 'United Arab Emirates');
    return url.toString();
  }
  return source.officialUrl;
}
