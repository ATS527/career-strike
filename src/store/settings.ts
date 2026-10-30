import { z } from 'zod';
import type { Db } from './db.js';

export type Classification = 'PUBLIC' | 'PERSONAL' | 'SENSITIVE';

interface SettingDef {
  schema: z.ZodType;
  classification: Classification;
  defaultValue: unknown;
}

// Every user-facing setting must be declared here; unknown keys are rejected.
export const SETTING_DEFS: Readonly<Record<string, SettingDef>> = {
  'search.preferredRoles': {
    schema: z.array(z.string().trim().min(1).max(100)).max(50),
    classification: 'PERSONAL',
    defaultValue: [],
  },
  'search.remotePreference': {
    schema: z.enum(['remote_only', 'hybrid_ok', 'onsite_ok']),
    classification: 'PERSONAL',
    defaultValue: 'remote_only',
  },
  'candidate.joiningAvailability': {
    schema: z.enum(['immediate', 'two_weeks', 'one_month', 'two_months_plus', 'unspecified']),
    classification: 'PERSONAL',
    defaultValue: 'unspecified',
  },
};

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
