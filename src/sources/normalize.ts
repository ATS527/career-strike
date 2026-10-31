import { normaliseLocation } from '../markets/countries.js';
import type { EmploymentType, MarketFacts, PublishedSalary, RemotePolicy } from './types.js';

/** Map a source's own workplace label. Anything not explicit stays unknown. */
export function remotePolicyFrom(label: string | null | undefined): RemotePolicy {
  const v = (label ?? '').toLowerCase().replace(/[\s_-]/g, '');
  if (v === 'remote' || v === 'fullyremote') return 'remote';
  if (v === 'hybrid') return 'hybrid';
  if (v === 'onsite' || v === 'inoffice' || v === 'office') return 'onsite';
  return 'unknown';
}

/** Map an employment label only when it says so explicitly ("Permanent" is not "full-time"). */
export function employmentTypeFrom(label: string | null | undefined): EmploymentType {
  const v = (label ?? '').toLowerCase();
  if (/full[\s-]?time/.test(v)) return 'full_time';
  if (/part[\s-]?time/.test(v)) return 'part_time';
  if (/intern/.test(v)) return 'internship';
  if (/contract|freelance/.test(v)) return 'contract';
  if (/temp|short[\s-]?term|fixed[\s-]?term|seasonal/.test(v)) return 'temporary';
  return 'unknown';
}

const INTERVALS: Readonly<Record<string, PublishedSalary['interval']>> = {
  year: 'year',
  yearly: 'year',
  annual: 'year',
  'per-year-salary': 'year',
  month: 'month',
  monthly: 'month',
  'per-month-salary': 'month',
  week: 'week',
  weekly: 'week',
  'per-week-salary': 'week',
  day: 'day',
  daily: 'day',
  'per-day-wage': 'day',
  hour: 'hour',
  hourly: 'hour',
  'per-hour-wage': 'hour',
};

/** Normalise "1 YEAR", "per-year-salary", "hourly" etc. Unknown intervals mean no salary is stored. */
export function salaryInterval(raw: string | null | undefined): PublishedSalary['interval'] | null {
  const v = (raw ?? '').toLowerCase().trim().replace(/^1\s+/, '');
  return INTERVALS[v] ?? null;
}

export function publishedSalary(
  currency: unknown,
  min: unknown,
  max: unknown,
  interval: unknown,
): PublishedSalary | null {
  const iv = typeof interval === 'string' ? salaryInterval(interval) : null;
  const cur = typeof currency === 'string' && /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : null;
  const lo = typeof min === 'number' && Number.isFinite(min) && min > 0 ? min : null;
  const hi = typeof max === 'number' && Number.isFinite(max) && max > 0 ? max : null;
  if (!iv || !cur || (lo === null && hi === null)) return null;
  return { currency: cur, min: lo, max: hi, interval: iv, source: 'structured' };
}

export function isoOrNull(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString();
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : new Date(t).toISOString();
  }
  return null;
}

/** Only keep http(s) links from sources; anything else (javascript:, data:) is dropped. */
export function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

export function unresolvedFacts(p: {
  remotePolicy: RemotePolicy;
  employmentType: EmploymentType;
  salary: PublishedSalary | null;
  locationText: string | null;
}): string[] {
  const facts: string[] = [];
  if (p.remotePolicy === 'unknown') facts.push('Work arrangement (remote, hybrid or on-site) is not stated.');
  if (p.remotePolicy === 'remote') facts.push('Countries or time zones eligible for remote work are not stated in structured form.');
  if (p.employmentType === 'unknown') facts.push('Employment type is not stated explicitly.');
  if (!p.salary) facts.push('Salary is not published in structured form.');
  if (!p.locationText) facts.push('Location is not stated.');
  return facts;
}

/**
 * Create the common international fields from what an existing ATS feed states structurally.
 * Greenhouse, Lever and Ashby do not establish visa, relocation or remote-country eligibility in
 * their board-level schemas, so those facts intentionally remain unknown.
 */
export function marketFacts(locationText: string | null, remotePolicy: RemotePolicy): MarketFacts {
  return {
    location: normaliseLocation(locationText),
    remoteEligibility: remotePolicy === 'remote' ? 'unknown' : 'not_remote',
    remoteEligibleCountries: [],
    visaSponsorship: 'unknown',
    workAuthorization: 'unknown',
    relocationAssistance: 'unknown',
  };
}
