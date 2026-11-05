import type { SourceCapability } from '../sources/capabilities.js';

/**
 * India marketplace policy. These records describe what Career Strike may claim and do today;
 * they are not adapters and therefore cannot turn a named site into automatic coverage.
 */
export interface IndiaSourceAssessment {
  id: string;
  name: string;
  capability: SourceCapability;
  automatedRetrieval: false;
  permittedUserAction: 'open_official_site' | 'supply_official_listing';
  officialUrl: string;
  reviewUrl: string;
  rationale: string;
}

export const INDIA_SOURCE_ASSESSMENTS: readonly IndiaSourceAssessment[] = [
  {
    id: 'ncs',
    name: 'National Career Service',
    capability: 'USER_DRIVEN_DISCOVERY',
    automatedRetrieval: false,
    permittedUserAction: 'open_official_site',
    officialUrl: 'https://ncs.gov.in/',
    reviewUrl: 'https://ncs.gov.in/',
    rationale:
      'Official government portal; no public Career Strike job-search integration or access grant is recorded.',
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
    id: 'indeed-india',
    name: 'Indeed India',
    capability: 'UNVERIFIED',
    automatedRetrieval: false,
    permittedUserAction: 'open_official_site',
    officialUrl: 'https://in.indeed.com/',
    reviewUrl: 'https://docs.indeed.com/legal-terms/developer-agreement',
    rationale: 'Partner API terms exist, but Career Strike has no approved integration or recorded access grant.',
  },
  {
    id: 'naukri',
    name: 'Naukri',
    capability: 'UNVERIFIED',
    automatedRetrieval: false,
    permittedUserAction: 'open_official_site',
    officialUrl: 'https://www.naukri.com/',
    reviewUrl: 'https://www.naukri.com/',
    rationale: 'No permitted programmatic access has been verified for Career Strike.',
  },
  {
    id: 'foundit',
    name: 'Foundit',
    capability: 'UNVERIFIED',
    automatedRetrieval: false,
    permittedUserAction: 'open_official_site',
    officialUrl: 'https://www.foundit.in/',
    reviewUrl: 'https://www.foundit.in/',
    rationale: 'No permitted programmatic access has been verified for Career Strike.',
  },
  {
    id: 'cutshort',
    name: 'Cutshort',
    capability: 'UNVERIFIED',
    automatedRetrieval: false,
    permittedUserAction: 'open_official_site',
    officialUrl: 'https://cutshort.io/',
    reviewUrl: 'https://cutshort.io/',
    rationale: 'No permitted programmatic access has been verified for Career Strike.',
  },
  {
    id: 'instahyre',
    name: 'Instahyre',
    capability: 'UNVERIFIED',
    automatedRetrieval: false,
    permittedUserAction: 'open_official_site',
    officialUrl: 'https://www.instahyre.com/',
    reviewUrl: 'https://www.instahyre.com/',
    rationale: 'No permitted programmatic access has been verified for Career Strike.',
  },
  {
    id: 'hirist',
    name: 'Hirist',
    capability: 'UNVERIFIED',
    automatedRetrieval: false,
    permittedUserAction: 'open_official_site',
    officialUrl: 'https://www.hirist.tech/',
    reviewUrl: 'https://www.hirist.tech/',
    rationale: 'No permitted programmatic access has been verified for Career Strike.',
  },
];

/** Opens a provider's own search UI. Query text is never sent to Career Strike's server. */
export function officialIndiaSearchUrl(source: IndiaSourceAssessment, query: string): string {
  const keywords = query.trim();
  if (source.id === 'linkedin-jobs') {
    const url = new URL('https://www.linkedin.com/jobs/search/');
    if (keywords) url.searchParams.set('keywords', keywords);
    url.searchParams.set('location', 'India');
    return url.toString();
  }
  if (source.id === 'indeed-india') {
    const url = new URL('https://in.indeed.com/jobs');
    if (keywords) url.searchParams.set('q', keywords);
    url.searchParams.set('l', 'India');
    return url.toString();
  }
  return source.officialUrl;
}
