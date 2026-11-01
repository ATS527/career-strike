import { z } from 'zod';
import type { Db } from './db.js';

export type Classification = 'PUBLIC' | 'PERSONAL' | 'SENSITIVE';

interface SettingDef {
  label: string;
  help: string;
  /** Human labels for enum values, shown by every client. */
  options?: Readonly<Record<string, string>>;
  schema: z.ZodType;
  classification: Classification;
  defaultValue: unknown;
}

const countryCode = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Use a two-letter ISO country code');

// Every user-facing setting must be declared here; unknown keys are rejected and the dashboard
// renders exactly these controls. Settings for features that do not exist yet are not declared.
export const SETTING_DEFS: Readonly<Record<string, SettingDef>> = {
  'search.preferredRoles': {
    label: 'Preferred roles',
    help: 'Job titles or role families you are targeting, one per line.',
    schema: z.array(z.string().trim().min(1).max(100)).max(50),
    classification: 'PERSONAL',
    defaultValue: [],
  },
  'search.preferredCountries': {
    label: 'Target countries',
    help: 'Countries where you want to find work, one two-letter ISO code per line (for example IN, DE). This affects ranking, not legal eligibility.',
    schema: z.array(countryCode).max(50),
    classification: 'PERSONAL',
    defaultValue: [],
  },
  'search.preferredCities': {
    label: 'Target cities',
    help: 'Cities you prefer, one per line (for example Bengaluru or Pune). This affects ranking, not legal eligibility.',
    schema: z.array(z.string().trim().min(1).max(100)).max(50),
    classification: 'PERSONAL',
    defaultValue: [],
  },
  'search.remotePreference': {
    label: 'Work arrangement',
    help: 'Which arrangements to consider.',
    options: { remote_only: 'Remote only', hybrid_ok: 'Remote or hybrid', onsite_ok: 'Remote, hybrid or on-site' },
    schema: z.enum(['remote_only', 'hybrid_ok', 'onsite_ok']),
    classification: 'PERSONAL',
    defaultValue: 'remote_only',
  },
  'search.employmentTypes': {
    label: 'Employment types',
    help: 'Employment types to consider.',
    options: { full_time: 'Full-time', part_time: 'Part-time', contract: 'Contract', temporary: 'Temporary', internship: 'Internship' },
    schema: z.array(z.enum(['full_time', 'part_time', 'contract', 'temporary', 'internship'])).min(1).max(5),
    classification: 'PERSONAL',
    defaultValue: ['full_time'],
  },
  'candidate.country': {
    label: 'Country of residence',
    help: 'Two-letter ISO code, e.g. IN or DE. Used for location eligibility.',
    schema: countryCode.nullable(),
    classification: 'PERSONAL',
    defaultValue: null,
  },
  'search.eligibleCountries': {
    label: 'Countries you can work in',
    help: 'Two-letter ISO codes where you are authorised to work, one per line.',
    schema: z.array(countryCode).max(50),
    classification: 'PERSONAL',
    defaultValue: [],
  },
  'candidate.workAuthorizations': {
    label: 'Work authorization by country',
    help: 'One entry per line: IN=authorised, DE=needs_sponsorship, or SG=unknown. This is kept locally and compared only with employer-published evidence.',
    schema: z.record(countryCode, z.enum(['authorised', 'needs_sponsorship', 'unknown'])),
    classification: 'SENSITIVE',
    defaultValue: {},
  },
  'candidate.joiningAvailability': {
    label: 'Joining availability',
    help: 'How soon you can start a new role.',
    options: { immediate: 'Immediately', two_weeks: 'Within 2 weeks', one_month: 'Within 1 month', two_months_plus: 'In 2 months or more', unspecified: 'Not specified' },
    schema: z.enum(['immediate', 'two_weeks', 'one_month', 'two_months_plus', 'unspecified']),
    classification: 'PERSONAL',
    defaultValue: 'unspecified',
  },
  'candidate.salaryExpectation': {
    label: 'Minimum salary expectation',
    help: 'Only compared against salaries that employers publish. Never shared without your approval.',
    options: { year: 'per year', month: 'per month', hour: 'per hour' },
    schema: z
      .object({
        currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Use a three-letter currency code'),
        minimum: z.number().int().positive().max(100_000_000),
        interval: z.enum(['year', 'month', 'hour']),
      })
      .strict()
      .nullable(),
    classification: 'SENSITIVE',
    defaultValue: null,
  },
  'monitoring.discoveryIntervalHours': {
    label: 'Check job boards automatically',
    help: 'How often Career Strike re-fetches the boards you monitor while the service is running. Off until you choose.',
    options: { '0': 'Off', '6': 'Every 6 hours', '12': 'Every 12 hours', '24': 'Once a day' },
    schema: z.enum(['0', '6', '12', '24']),
    classification: 'PERSONAL',
    defaultValue: '0',
  },
  'monitoring.updateChecks': {
    label: 'Check for new versions',
    help: 'Once a week, ask GitHub whether a newer Career Strike has been released. This is one request for the public release list and sends nothing about you. Off until you choose; `career-strike update` always works.',
    options: { off: 'Off', weekly: 'Once a week' },
    schema: z.enum(['off', 'weekly']),
    classification: 'PUBLIC',
    defaultValue: 'off',
  },
  'identity.fullName': {
    label: 'Full name',
    help: 'As you want it to appear on applications.',
    schema: z.string().trim().max(150).nullable(),
    classification: 'SENSITIVE',
    defaultValue: null,
  },
  'identity.email': {
    label: 'Email for applications',
    help: 'Shown to employers only in applications you approve.',
    schema: z.email('Enter a valid email address').max(254).nullable(),
    classification: 'SENSITIVE',
    defaultValue: null,
  },
  'identity.phone': {
    label: 'Phone for applications',
    help: 'Include the country code, e.g. +91 98765 43210.',
    schema: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ()-]{7,25}$/, 'Use digits, spaces and an optional leading +')
      .nullable(),
    classification: 'SENSITIVE',
    defaultValue: null,
  },
  'identity.profileLinks': {
    label: 'Profile links',
    help: 'LinkedIn, GitHub or portfolio links, one per line.',
    schema: z.array(z.url({ protocol: /^https$/, error: 'Use https:// links' }).max(300)).max(5),
    classification: 'SENSITIVE',
    defaultValue: [],
  },
  'search.excludedEmployers': {
    label: 'Excluded employers',
    help: 'Employers to hide from recommendations, one per line.',
    schema: z.array(z.string().trim().min(1).max(200)).max(500),
    classification: 'PERSONAL',
    defaultValue: [],
  },
};

export interface SettingDescription {
  key: string;
  label: string;
  help: string;
  options: Readonly<Record<string, string>>;
  classification: Classification;
  schema: unknown;
}

/** Declarations for clients: label, help and JSON Schema per setting. Never includes values. */
export function describeSettings(): SettingDescription[] {
  return Object.entries(SETTING_DEFS).map(([key, def]) => ({
    key,
    label: def.label,
    help: def.help,
    options: def.options ?? {},
    classification: def.classification,
    schema: z.toJSONSchema(def.schema, { io: 'input' }),
  }));
}

export class SettingError extends Error {
  constructor(
    readonly code: 'UNKNOWN_SETTING' | 'INVALID_SETTING',
    message: string,
    readonly issues: readonly unknown[] = [],
  ) {
    super(message);
  }
}

export function getSettings(db: Db): Record<string, unknown> {
  const rows = db.prepare('SELECT key, value_json FROM settings').all() as { key: string; value_json: string }[];
  const stored = new Map(rows.map((r) => [r.key, JSON.parse(r.value_json) as unknown]));
  return Object.fromEntries(
    Object.entries(SETTING_DEFS).map(([key, def]) => [key, stored.has(key) ? stored.get(key) : def.defaultValue]),
  );
}

export function setSetting(db: Db, key: string, value: unknown, actor: string): unknown {
  const def = Object.hasOwn(SETTING_DEFS, key) ? SETTING_DEFS[key] : undefined;
  if (!def) throw new SettingError('UNKNOWN_SETTING', `Unknown setting: ${key}`);
  const parsed = def.schema.safeParse(value);
  if (!parsed.success) throw new SettingError('INVALID_SETTING', `Invalid value for ${key}`, parsed.error.issues);
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO settings (key, value_json, classification, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json,
         classification = excluded.classification, updated_at = excluded.updated_at`,
    ).run(key, JSON.stringify(parsed.data), def.classification, now);
    // Audit the key only: setting values may be personal data.
    db.prepare('INSERT INTO audit_events (at, actor, action, subject) VALUES (?, ?, ?, ?)').run(now, actor, 'setting.updated', key);
  })();
  return parsed.data;
}
