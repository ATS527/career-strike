import type { SourceCapability } from '../sources/capabilities.js';

/**
 * Croatia marketplace policy. These records describe what Career Strike may claim and do today; they
 * are not adapters and therefore cannot turn a named site into automatic coverage.
 */
export interface CroatiaSourceAssessment {
  id: string;
  name: string;
  capability: SourceCapability;
  automatedRetrieval: false;
  permittedUserAction: 'open_official_site' | 'supply_official_listing';
  officialUrl: string;
  reviewUrl: string;
  rationale: string;
}

export const CROATIA_SOURCE_ASSESSMENTS: readonly CroatiaSourceAssessment[] = [
  {
    id: 'eures-croatia',
    name: 'EURES Croatia',
    capability: 'USER_DRIVEN_DISCOVERY',
    automatedRetrieval: false,
    permittedUserAction: 'open_official_site',
    officialUrl:
      'https://eures.europa.eu/living-and-working/labour-market-information/labour-market-information-croatia_en',
    reviewUrl:
      'https://eures.europa.eu/living-and-working/labour-market-information/labour-market-information-croatia_en',
    rationale:
      'Official European employment-service information for Croatia; no automated Career Strike retrieval or access grant is recorded.',
  },
  {
    id: 'mup-croatia',
    name: 'MUP stay and work permit',
    capability: 'USER_DRIVEN_DISCOVERY',
    automatedRetrieval: false,
    permittedUserAction: 'open_official_site',
    officialUrl: 'https://mup.gov.hr/aliens-281621/286833?big=1',
    reviewUrl: 'https://mup.gov.hr/aliens-281621/286833?big=1',
    rationale:
      'Official Croatian Ministry of Interior guidance for stay and work permits; a digital-nomad stay is not Croatian-employer work authorization.',
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
    id: 'indeed-croatia',
    name: 'Indeed Croatia',
    capability: 'UNVERIFIED',
    automatedRetrieval: false,
    permittedUserAction: 'open_official_site',
    officialUrl: 'https://hr.indeed.com/',
    reviewUrl: 'https://docs.indeed.com/legal-terms/developer-agreement',
    rationale: 'Partner API terms exist, but Career Strike has no approved integration or recorded access grant.',
  },
];

/** Opens a provider's own search UI. Query text is never sent to Career Strike's server. */
export function officialCroatiaSearchUrl(source: CroatiaSourceAssessment, query: string): string {
  const keywords = query.trim();
  if (source.id === 'linkedin-jobs') {
    const url = new URL('https://www.linkedin.com/jobs/search/');
    if (keywords) url.searchParams.set('keywords', keywords);
    url.searchParams.set('location', 'Croatia');
    return url.toString();
  }
  if (source.id === 'indeed-croatia') {
    const url = new URL('https://hr.indeed.com/jobs');
    if (keywords) url.searchParams.set('q', keywords);
    url.searchParams.set('l', 'Croatia');
    return url.toString();
  }
  return source.officialUrl;
}
