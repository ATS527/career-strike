import type { SourceCapability } from '../sources/capabilities.js';

/**
 * Japan marketplace policy. These records describe what Career Strike may claim and do today; they
 * are not adapters and therefore cannot turn a named site into automatic coverage.
 */
export interface JapanSourceAssessment {
  id: string;
  name: string;
  capability: SourceCapability;
  automatedRetrieval: false;
  permittedUserAction: 'open_official_site' | 'supply_official_listing';
  officialUrl: string;
  reviewUrl: string;
  rationale: string;
}

export const JAPAN_SOURCE_ASSESSMENTS: readonly JapanSourceAssessment[] = [
  {
    id: 'hello-work', name: 'Hello Work', capability: 'USER_DRIVEN_DISCOVERY', automatedRetrieval: false,
    permittedUserAction: 'open_official_site', officialUrl: 'https://www.hellowork.go.jp/', reviewUrl: 'https://www.hellowork.go.jp/',
    rationale: 'Official public employment service of Japan (Japanese-language); no public Career Strike job-search integration or access grant is recorded.',
  },
  {
    id: 'gaijinpot', name: 'GaijinPot Jobs', capability: 'USER_DRIVEN_DISCOVERY', automatedRetrieval: false,
    permittedUserAction: 'open_official_site', officialUrl: 'https://gaijinpot.com/', reviewUrl: 'https://gaijinpot.com/',
    rationale: 'Bilingual jobs board for Japan; open the official site and search directly; no automated retrieval is claimed.',
  },
  {
    id: 'linkedin-jobs', name: 'LinkedIn Jobs', capability: 'RESTRICTED', automatedRetrieval: false,
    permittedUserAction: 'open_official_site', officialUrl: 'https://www.linkedin.com/jobs/', reviewUrl: 'https://www.linkedin.com/legal/jobs-terms-conditions',
    rationale: 'Automated scraping or extraction needs LinkedIn’s express written authorisation.',
  },
  {
    id: 'indeed-japan', name: 'Indeed Japan', capability: 'UNVERIFIED', automatedRetrieval: false,
    permittedUserAction: 'open_official_site', officialUrl: 'https://jp.indeed.com/', reviewUrl: 'https://docs.indeed.com/legal-terms/developer-agreement',
    rationale: 'Partner API terms exist, but Career Strike has no approved integration or recorded access grant.',
  },
  {
    id: 'daijob', name: 'Daijob', capability: 'UNVERIFIED', automatedRetrieval: false,
    permittedUserAction: 'open_official_site', officialUrl: 'https://www.daijob.com/', reviewUrl: 'https://www.daijob.com/',
    rationale: 'No permitted programmatic access has been verified for Career Strike.',
  },
];

/** Opens a provider's own search UI. Query text is never sent to Career Strike's server. */
export function officialJapanSearchUrl(source: JapanSourceAssessment, query: string): string {
  const keywords = query.trim();
  if (source.id === 'linkedin-jobs') {
    const url = new URL('https://www.linkedin.com/jobs/search/');
    if (keywords) url.searchParams.set('keywords', keywords);
    url.searchParams.set('location', 'Japan');
    return url.toString();
  }
  if (source.id === 'indeed-japan') {
    const url = new URL('https://jp.indeed.com/jobs');
    if (keywords) url.searchParams.set('q', keywords);
    url.searchParams.set('l', 'Japan');
    return url.toString();
  }
  return source.officialUrl;
}
