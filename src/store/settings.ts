import { z } from 'zod';
import type { Db } from './db.js';

export type Classification = 'PUBLIC' | 'PERSONAL' | 'SENSITIVE';

interface SettingDef {
  label: string;
  help: string;
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
  'search.remotePreference': {
    label: 'Work arrangement',
    help: 'Which arrangements to consider.',
    schema: z.enum(['remote_only', 'hybrid_ok', 'onsite_ok']),
    classification: 'PERSONAL',
    defaultValue: 'remote_only',
  },
  'search.employmentTypes': {
    label: 'Employment types',
    help: 'Employment types to consider.',
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
  'candidate.joiningAvailability': {
    label: 'Joining availability',
    help: 'How soon you can start a new role.',
    schema: z.enum(['immediate', 'two_weeks', 'one_month', 'two_months_plus', 'unspecified']),
    classification: 'PERSONAL',
    defaultValue: 'unspecified',
  },
  'candidate.salaryExpectation': {
    label: 'Minimum salary expectation',
    help: 'Only compared against salaries that employers publish. Never shared without your approval.',
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
  classification: Classification;
  schema: unknown;
}

/** Declarations for clients: label, help and JSON Schema per setting. Never includes values. */
export function describeSettings(): SettingDescription[] {
  return Object.entries(SETTING_DEFS).map(([key, def]) => ({
    key,
    label: def.label,
    help: def.help,
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
