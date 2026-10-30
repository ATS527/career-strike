import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { canonicalSkill, skillsIn } from '../matching/skills.js';
import type { Db } from '../store/db.js';

const thisYear = (): number => new Date().getUTCFullYear();
const year = z.number().int().min(1950).max(2100);

export const FactValues = {
  skill: z
    .object({
      name: z.string().trim().min(1, 'Enter a skill').max(80),
      years: z.number().min(0).max(60).nullable().default(null),
      level: z.enum(['familiar', 'proficient', 'expert']).nullable().default(null),
    })
    .strict(),
  role: z
    .object({
      title: z.string().trim().min(1, 'Enter a job title').max(150),
      employer: z.string().trim().max(150).nullable().default(null),
      startYear: year,
      endYear: year.nullable().default(null),
      summary: z.string().trim().max(2000).nullable().default(null),
    })
    .strict()
    .refine((r) => r.endYear === null || r.endYear >= r.startYear, { message: 'End year is before start year', path: ['endYear'] })
    .refine((r) => r.startYear <= thisYear(), { message: 'Start year is in the future', path: ['startYear'] }),
  education: z
    .object({
      qualification: z.string().trim().min(1, 'Enter a qualification').max(150),
      institution: z.string().trim().max(150).nullable().default(null),
      year: year.nullable().default(null),
    })
    .strict(),
  certification: z
    .object({
      name: z.string().trim().min(1, 'Enter a certification').max(150),
      issuer: z.string().trim().max(150).nullable().default(null),
      year: year.nullable().default(null),
    })
    .strict(),
  language: z
    .object({
      name: z.string().trim().min(1, 'Enter a language').max(60),
      level: z.enum(['basic', 'professional', 'native']),
    })
    .strict(),
} as const;

export type FactKind = keyof typeof FactValues;
export type FactValue<K extends FactKind> = z.output<(typeof FactValues)[K]>;

export const NewFact = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('skill'), value: FactValues.skill }).strict(),
  z.object({ kind: z.literal('role'), value: FactValues.role }).strict(),
  z.object({ kind: z.literal('education'), value: FactValues.education }).strict(),
  z.object({ kind: z.literal('certification'), value: FactValues.certification }).strict(),
  z.object({ kind: z.literal('language'), value: FactValues.language }).strict(),
]);

export interface ProfileFact {
  id: string;
  kind: FactKind;
  value: Record<string, unknown>;
  source: 'user' | 'document';
  approved: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Row {
  id: string;
  kind: FactKind;
  value_json: string;
  source: 'user' | 'document';
  approved: number;
  created_at: string;
  updated_at: string;
}

const toFact = (r: Row): ProfileFact => ({
  id: r.id,
  kind: r.kind,
  value: JSON.parse(r.value_json) as Record<string, unknown>,
  source: r.source,
  approved: r.approved === 1,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** Store a known skill under its canonical name so "k8s" and "Kubernetes" match postings alike. */
function normaliseValue(kind: FactKind, value: Record<string, unknown>): Record<string, unknown> {
  if (kind === 'skill' && typeof value.name === 'string') return { ...value, name: canonicalSkill(value.name) ?? value.name };
  return value;
}

export function listFacts(db: Db, opts: { approvedOnly?: boolean } = {}): ProfileFact[] {
  const rows = db
    .prepare(`SELECT * FROM profile_facts ${opts.approvedOnly ? 'WHERE approved = 1' : ''} ORDER BY kind, created_at`)
    .all() as Row[];
  return rows.map(toFact);
}

/** Facts typed by the candidate are approved on save: they are the candidate's own statement. */
export function addFact(db: Db, input: z.infer<typeof NewFact>, actor: string): ProfileFact {
  const id = `fact_${randomBytes(9).toString('base64url')}`;
  const at = new Date().toISOString();
  const value = normaliseValue(input.kind, input.value as Record<string, unknown>);
  db.transaction(() => {
    db.prepare(
      "INSERT INTO profile_facts (id, kind, value_json, source, approved, created_at, updated_at) VALUES (?, ?, ?, 'user', 1, ?, ?)",
    ).run(id, input.kind, JSON.stringify(value), at, at);
    // Audit the kind only: values are sensitive.
    db.prepare('INSERT INTO audit_events (at, actor, action, subject) VALUES (?, ?, ?, ?)').run(at, actor, 'profile.fact.added', `${input.kind}:${id}`);
  })();
  return toFact(db.prepare('SELECT * FROM profile_facts WHERE id = ?').get(id) as Row);
}

export function updateFact(db: Db, id: string, value: unknown, actor: string): ProfileFact | 'not_found' | z.ZodError {
  const row = db.prepare('SELECT * FROM profile_facts WHERE id = ?').get(id) as Row | undefined;
  if (!row) return 'not_found';
  const parsed = FactValues[row.kind].safeParse(value);
  if (!parsed.success) return parsed.error;
  const at = new Date().toISOString();
  db.transaction(() => {
    db.prepare("UPDATE profile_facts SET value_json = ?, source = 'user', approved = 1, updated_at = ? WHERE id = ?").run(
      JSON.stringify(normaliseValue(row.kind, parsed.data as Record<string, unknown>)),
      at,
      id,
    );
    db.prepare('INSERT INTO audit_events (at, actor, action, subject) VALUES (?, ?, ?, ?)').run(at, actor, 'profile.fact.updated', `${row.kind}:${id}`);
  })();
  return toFact(db.prepare('SELECT * FROM profile_facts WHERE id = ?').get(id) as Row);
}

export function deleteFact(db: Db, id: string, actor: string): boolean {
  const at = new Date().toISOString();
  let deleted = false;
  db.transaction(() => {
    deleted = db.prepare('DELETE FROM profile_facts WHERE id = ?').run(id).changes > 0;
    if (deleted) db.prepare('INSERT INTO audit_events (at, actor, action, subject) VALUES (?, ?, ?, ?)').run(at, actor, 'profile.fact.deleted', id);
  })();
  return deleted;
}

/**
 * Suggest skills found in résumé text. Each becomes an unapproved, document-sourced fact: it is
 * shown for the candidate to approve or discard and is invisible to matching and applications
 * until approved. Skills already in the profile are not suggested again.
 */
export function suggestSkills(db: Db, text: string, actor: string): ProfileFact[] {
  const have = new Set(
    listFacts(db)
      .filter((f) => f.kind === 'skill')
      .map((f) => String(f.value.name).toLowerCase()),
  );
  const found = skillsIn(text).filter((name) => !have.has(name.toLowerCase()));
  const at = new Date().toISOString();
  const ids: string[] = [];
  db.transaction(() => {
    for (const name of found) {
      const id = `fact_${randomBytes(9).toString('base64url')}`;
      db.prepare(
        "INSERT INTO profile_facts (id, kind, value_json, source, approved, created_at, updated_at) VALUES (?, 'skill', ?, 'document', 0, ?, ?)",
      ).run(id, JSON.stringify({ name, years: null, level: null }), at, at);
      ids.push(id);
    }
    db.prepare('INSERT INTO audit_events (at, actor, action, subject) VALUES (?, ?, ?, ?)').run(at, actor, 'profile.skills.suggested', `${ids.length} suggested`);
  })();
  return ids.map((id) => toFact(db.prepare('SELECT * FROM profile_facts WHERE id = ?').get(id) as Row));
}

/** The candidate confirms a suggested fact; from now on it is used like one they typed. */
export function approveFact(db: Db, id: string, actor: string): ProfileFact | null {
  const at = new Date().toISOString();
  let changed = false;
  db.transaction(() => {
    changed = db.prepare('UPDATE profile_facts SET approved = 1, updated_at = ? WHERE id = ? AND approved = 0').run(at, id).changes > 0;
    if (changed) db.prepare('INSERT INTO audit_events (at, actor, action, subject) VALUES (?, ?, ?, ?)').run(at, actor, 'profile.fact.approved', id);
  })();
  const row = db.prepare('SELECT * FROM profile_facts WHERE id = ?').get(id) as Row | undefined;
  return row ? toFact(row) : null;
}

/** The approved profile in the shape matching needs. Unapproved facts are invisible here. */
export interface CandidateProfile {
  skills: { name: string; years: number | null; level: string | null; factId: string }[];
  roles: { title: string; employer: string | null; startYear: number; endYear: number | null; factId: string }[];
  totalYears: number | null;
}

export function approvedProfile(db: Db, now = new Date()): CandidateProfile {
  const facts = listFacts(db, { approvedOnly: true });
  const skills = facts
    .filter((f) => f.kind === 'skill')
    .map((f) => ({ name: String(f.value.name), years: (f.value.years as number | null) ?? null, level: (f.value.level as string | null) ?? null, factId: f.id }));
  const roles = facts
    .filter((f) => f.kind === 'role')
    .map((f) => ({
      title: String(f.value.title),
      employer: (f.value.employer as string | null) ?? null,
      startYear: Number(f.value.startYear),
      endYear: (f.value.endYear as number | null) ?? null,
      factId: f.id,
    }));
  return { skills, roles, totalYears: roles.length ? experienceYears(roles, now.getUTCFullYear()) : null };
}

/** Years of experience from role spans, counting overlapping roles once. */
export function experienceYears(roles: { startYear: number; endYear: number | null }[], currentYear: number): number {
  const spans = roles.map((r) => [r.startYear, r.endYear ?? currentYear] as const).sort((a, b) => a[0] - b[0]);
  let total = 0;
  let curStart = -Infinity;
  let curEnd = -Infinity;
  for (const [s, e] of spans) {
    if (s > curEnd) {
      if (curEnd > curStart) total += curEnd - curStart;
      curStart = s;
      curEnd = e;
    } else curEnd = Math.max(curEnd, e);
  }
  if (curEnd > curStart) total += curEnd - curStart;
  return total;
}
