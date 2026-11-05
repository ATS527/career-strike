import type { SourceId } from './types.js';

export type SourceCapability =
  | 'AUTHORIZED_PUBLIC_API'
  | 'AUTHORIZED_PARTNER_API'
  | 'PERMITTED_STRUCTURED_FEED'
  | 'AUTHORIZED_EMPLOYER_DIRECT'
  | 'USER_DRIVEN_DISCOVERY'
  | 'LINK_ONLY'
  | 'RESTRICTED'
  | 'UNAVAILABLE'
  | 'UNVERIFIED';

export interface SourceCapabilityRecord {
  source: SourceId;
  capability: SourceCapability;
  label: string;
  automatedRetrieval: boolean;
  applicationRetrieval: boolean;
  note: string;
}

const RECORDS: Readonly<Record<SourceId, SourceCapabilityRecord>> = {
  greenhouse: {
    source: 'greenhouse',
    capability: 'AUTHORIZED_EMPLOYER_DIRECT',
    label: 'Verified employer-direct feed',
    automatedRetrieval: true,
    applicationRetrieval: true,
    note: 'Public board API; a user-selected board is verified by a successful fetch.',
  },
  lever: {
    source: 'lever',
    capability: 'AUTHORIZED_EMPLOYER_DIRECT',
    label: 'Verified employer-direct feed',
    automatedRetrieval: true,
    applicationRetrieval: false,
    note: 'Public employer posting feed; application questions are completed on the employer site.',
  },
  ashby: {
    source: 'ashby',
    capability: 'AUTHORIZED_EMPLOYER_DIRECT',
    label: 'Verified employer-direct feed',
    automatedRetrieval: true,
    applicationRetrieval: false,
    note: 'Public listed-posting feed; unlisted postings are excluded.',
  },
  practice: {
    source: 'practice',
    capability: 'UNAVAILABLE',
    label: 'Local practice only',
    automatedRetrieval: true,
    applicationRetrieval: true,
    note: 'Owned loopback test endpoint, never a real employer source.',
  },
};

export function capabilityFor(source: SourceId): SourceCapabilityRecord {
  return RECORDS[source];
}

/** Manual entries are user-driven records, not an implied integration. Unknown IDs stay unverified. */
export function capabilityForName(source: string): SourceCapability {
  if (source in RECORDS) return RECORDS[source as SourceId].capability;
  return source === 'manual' ? 'USER_DRIVEN_DISCOVERY' : 'UNVERIFIED';
}
