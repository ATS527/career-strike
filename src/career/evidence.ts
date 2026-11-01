import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '../store/db.js';
import { listFacts } from './profile.js';

const url = z.string().url().max(2_000);

export const EvidenceValues = {
  project: z.object({
    name: z.string().trim().min(1).max(160),
    summary: z.string().trim().min(1).max(2_000),
    skills: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
    url: url.nullable().default(null),
  }).strict(),
  achievement: z.object({
    text: z.string().trim().min(1).max(1_000),
    roleFactId: z.string().regex(/^fact_[A-Za-z0-9_-]+$/).nullable().default(null),
  }).strict(),
  portfolio: z.object({
    label: z.string().trim().min(1).max(120),
    url,
  }).strict(),
  employment_detail: z.object({
    roleFactId: z.string().regex(/^fact_[A-Za-z0-9_-]+$/),
    summary: z.string().trim().min(1).max(2_000),
  }).strict(),
} as const;

export type EvidenceKind = keyof typeof EvidenceValues;
export const NewEvidence = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('project'), value: EvidenceValues.project }).strict(),
  z.object({ kind: z.literal('achievement'), value: EvidenceValues.achievement }).strict(),
  z.object({ kind: z.literal('portfolio'), value: EvidenceValues.portfolio }).strict(),
  z.object({ kind: z.literal('employment_detail'), value: EvidenceValues.employment_detail }).strict(),
]);

export interface ProfileEvidence {
  id: string;
  kind: EvidenceKind;
  value: Record<string, unknown>;
  source: 'user' | 'document';
  confirmed: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Row {
  id: string;
  kind: EvidenceKind;
  value_json: string;
  source: 'user' | 'document';
  confirmed: number;
  created_at: string;
  updated_at: string;
}

const toEvidence = (row: Row): ProfileEvidence => ({
  id: row.id,
  kind: row.kind,
  value: JSON.parse(row.value_json) as Record<string, unknown>,
  source: row.source,
  confirmed: row.confirmed === 1,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export function listEvidence(db: Db, opts: { confirmedOnly?: boolean } = {}): ProfileEvidence[] {
  const rows = db.prepare(`SELECT * FROM profile_evidence ${opts.confirmedOnly ? 'WHERE confirmed = 1' : ''} ORDER BY kind, created_at`).all() as Row[];
  return rows.map(toEvidence);
}

/** Candidate-entered evidence is confirmed immediately; parsers may only create unconfirmed rows. */
export function addEvidence(db: Db, input: z.infer<typeof NewEvidence>, actor: string): ProfileEvidence {
  const id = `evidence_${randomBytes(9).toString('base64url')}`;
  const at = new Date().toISOString();
  db.transaction(() => {
    db.prepare("INSERT INTO profile_evidence (id, kind, value_json, source, confirmed, created_at, updated_at) VALUES (?, ?, ?, 'user', 1, ?, ?)")
      .run(id, input.kind, JSON.stringify(input.value), at, at);
    db.prepare('INSERT INTO audit_events (at, actor, action, subject) VALUES (?, ?, ?, ?)').run(at, actor, 'profile.evidence.added', `${input.kind}:${id}`);
  })();
  return toEvidence(db.prepare('SELECT * FROM profile_evidence WHERE id = ?').get(id) as Row);
}

export function updateEvidence(db: Db, id: string, value: unknown, actor: string): ProfileEvidence | 'not_found' | z.ZodError {
  const current = db.prepare('SELECT * FROM profile_evidence WHERE id = ?').get(id) as Row | undefined;
  if (!current) return 'not_found';
  const parsed = EvidenceValues[current.kind].safeParse(value);
  if (!parsed.success) return parsed.error;
  const at = new Date().toISOString();
  db.transaction(() => {
    db.prepare("UPDATE profile_evidence SET value_json = ?, source = 'user', confirmed = 1, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(parsed.data), at, id);
    db.prepare('INSERT INTO audit_events (at, actor, action, subject) VALUES (?, ?, ?, ?)').run(at, actor, 'profile.evidence.updated', `${current.kind}:${id}`);
  })();
  return toEvidence(db.prepare('SELECT * FROM profile_evidence WHERE id = ?').get(id) as Row);
}

export function confirmEvidence(db: Db, id: string, actor: string): ProfileEvidence | null {
  const at = new Date().toISOString();
  let changed = false;
  db.transaction(() => {
    changed = db.prepare('UPDATE profile_evidence SET confirmed = 1, updated_at = ? WHERE id = ? AND confirmed = 0').run(at, id).changes > 0;
    if (changed) db.prepare('INSERT INTO audit_events (at, actor, action, subject) VALUES (?, ?, ?, ?)').run(at, actor, 'profile.evidence.confirmed', id);
  })();
  const row = db.prepare('SELECT * FROM profile_evidence WHERE id = ?').get(id) as Row | undefined;
  return row ? toEvidence(row) : null;
}

export function deleteEvidence(db: Db, id: string, actor: string): boolean {
  const at = new Date().toISOString();
  const removed = db.prepare('DELETE FROM profile_evidence WHERE id = ?').run(id).changes > 0;
  if (removed) db.prepare('INSERT INTO audit_events (at, actor, action, subject) VALUES (?, ?, ?, ?)').run(at, actor, 'profile.evidence.deleted', id);
  return removed;
}

/** A stable snapshot of facts eligible for generated claims. It deliberately excludes unconfirmed evidence. */
export function profileFingerprint(db: Db): string {
  const value = {
    facts: listFacts(db, { approvedOnly: true }).map((f) => ({ id: f.id, kind: f.kind, value: f.value })),
    evidence: listEvidence(db, { confirmedOnly: true }).map((e) => ({ id: e.id, kind: e.kind, value: e.value })),
  };
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
