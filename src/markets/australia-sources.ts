import type { SourceCapability } from '../sources/capabilities.js';

/**
 * Australia marketplace policy. These records describe what Career Strike may claim and do today;
 * they are not adapters and therefore cannot turn a named site into automatic coverage.
 */
export interface AustraliaSourceAssessment {
  id: string;
  name: string;
  capability: SourceCapability;
  automatedRetrieval: false;
  permittedUserAction: 'open_official_site' | 'supply_official_listing';
  officialUrl: string;
  reviewUrl: string;
  rationale: string;
}

export const AUSTRALIA_SOURCE_ASSESSMENTS: readonly AustraliaSourceAssessment[] = [
  {
    id: 'workforce-australia',
    name: 'Workforce Australia',
    capability: 'USER_DRIVEN_DISCOVERY',
    automatedRetrieval: false,
    permittedUserAction: 'open_official_site',
    officialUrl: 'https://www.workforceaustralia.gov.au/',
    reviewUrl: 'https://www.workforceaustralia.gov.au/',
    rationale:
      'Official employment service of the Australian Government; no public Career Strike integration or access grant is recorded.',
  },
  {
    id: 'linkedin-jobs',
    name: 'LinkedIn Jobs',
    capability: 'RESTRICTED',
    automatedRetrieval: false,
    permittedUserAction: 'open_official_site',
    officialUrl: 'https://www.linkedin.com/jobs/',
    reviewUrl: 'https://www.linkedin.com/legal/jobs-terms-conditions',
    rationale: 'Automated scraping or extraction needs LinkedIn’s express written authorisation.',
  },
  {
    id: 'indeed-australia',
    name: 'Indeed Australia',
    capability: 'UNVERIFIED',
    automatedRetrieval: false,
    permittedUserAction: 'open_official_site',
    officialUrl: 'https://au.indeed.com/',
    reviewUrl: 'https://docs.indeed.com/legal-terms/developer-agreement',
    rationale: 'Partner API terms exist, but Career Strike has no approved integration or recorded access grant.',
  },
  {
    id: 'seek',
    name: 'Seek',
    capability: 'UNVERIFIED',
    automatedRetrieval: false,
    permittedUserAction: 'open_official_site',
    officialUrl: 'https://www.seek.com.au/',
    reviewUrl: 'https://www.seek.com.au/',
    rationale: 'No permitted programmatic access has been verified for Career Strike.',
  },
];

/** Opens a provider's own search UI. Query text is never sent to Career Strike's server. */
export function officialAustraliaSearchUrl(source: AustraliaSourceAssessment, query: string): string {
  const keywords = query.trim();
  if (source.id === 'linkedin-jobs') {
    const url = new URL('https://www.linkedin.com/jobs/search/');
    if (keywords) url.searchParams.set('keywords', keywords);
    url.searchParams.set('location', 'Australia');
    return url.toString();
  }
  if (source.id === 'indeed-australia') {
    const url = new URL('https://au.indeed.com/jobs');
    if (keywords) url.searchParams.set('q', keywords);
    url.searchParams.set('l', 'Australia');
    return url.toString();
  }
  return source.officialUrl;
}
