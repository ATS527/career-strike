import type { EffectiveStatus, JobSummary, PublishedSalary } from './api';

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const dateOnly = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return 'never';
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return relative.format(seconds, 'second');
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return relative.format(Math.round(seconds / 3600), 'hour');
  return relative.format(Math.round(seconds / 86400), 'day');
}

export const formatDateTime = (iso: string): string => dateTime.format(new Date(iso));
export const formatDate = (iso: string): string => dateOnly.format(new Date(iso));

export const REMOTE_LABEL: Record<JobSummary['remotePolicy'], string> = {
  remote: 'Remote',
  hybrid: 'Hybrid',
  onsite: 'On-site',
  unknown: 'Arrangement not stated',
};

export const EMPLOYMENT_LABEL: Record<string, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  temporary: 'Temporary',
  internship: 'Internship',
  unknown: 'Employment type not stated',
};

export const SOURCE_LABEL: Record<string, string> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
  manual: 'Added by you',
};

/** What may truthfully be said about a posting's status. */
export function statusText(status: EffectiveStatus, lastVerifiedAt: string | null): { label: string; detail: string } {
  switch (status) {
    case 'OPEN':
      return { label: 'Open', detail: `verified ${ago(lastVerifiedAt)}` };
    case 'STALE':
      return { label: 'May have closed', detail: `last verified ${ago(lastVerifiedAt)}` };
    case 'CLOSED':
      return { label: 'Closed', detail: lastVerifiedAt ? `taken down; noticed ${ago(lastVerifiedAt)}` : 'taken down' };
    case 'UNVERIFIED':
      return { label: 'Unverified', detail: 'added by you; not checked against a job board' };
  }
}

export function formatSalary(s: PublishedSalary | null): string | null {
  if (!s) return null;
  const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: s.currency, maximumFractionDigits: 0, notation: 'compact' });
  const range = s.min !== null && s.max !== null ? `${money.format(s.min)}–${money.format(s.max)}` : money.format((s.min ?? s.max)!);
  return `${range} per ${s.interval}`;
}

export const TIER_LABEL: Record<string, string> = {
  strong: 'Strong fit',
  possible: 'Possible fit',
  stretch: 'Stretch',
  ineligible: 'Not eligible',
  unknown: 'Fit unknown',
};

export const VERDICT_LABEL: Record<string, string> = {
  meets: 'Meets',
  partial: 'Partly',
  gap: 'Gap',
  unknown: 'Unknown',
};

export const EVIDENCE_LABEL: Record<string, string> = {
  posting: 'Posting',
  profile: 'Your profile',
  settings: 'Your settings',
  inferred: 'Career Strike’s inference',
};
