import { createHash } from 'node:crypto';
import { z } from 'zod';

// The exact package an approval covers. Everything a candidate is asked to approve is in here,
// and the payload hash is computed over its canonical JSON.

export const Destination = z
  .object({
    method: z.enum(['manual', 'assisted', 'test-ats']),
    /** The employer's official application page, or the owned test endpoint. */
    url: z.string().url().nullable(),
  })
  .strict();

export const Field = z
  .object({
    key: z.string().min(1).max(100),
    label: z.string().min(1).max(500),
    required: z.boolean(),
    kind: z.enum(['text', 'long_text', 'file', 'choice']),
    options: z.array(z.string().max(300)).max(100).default([]),
    /** Where the value came from, so the review screen can say so. */
    source: z.enum(['identity', 'document', 'draft', 'candidate', 'empty']),
    value: z.string().max(20_000).nullable(),
  })
  .strict();

export const Attachment = z
  .object({
    documentId: z.string(),
    kind: z.enum(['resume', 'cover_letter', 'other']),
    filename: z.string(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

/** Immutable, reviewed source-text variants associated with this exact application package. */
export const PersonalizationBinding = z
  .object({
    profileFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
    snapshotId: z.string(),
    variants: z
      .array(z.object({ id: z.string(), kind: z.enum(['resume', 'cover_letter']), contentHash: z.string().regex(/^[0-9a-f]{64}$/) }).strict())
      .min(1)
      .max(2),
  })
  .strict();
export type PersonalizationBinding = z.infer<typeof PersonalizationBinding>;

export const ApplicationPayload = z
  .object({
    job: z.object({ id: z.string(), canonicalKey: z.string(), employer: z.string(), title: z.string() }).strict(),
    destination: Destination,
    identity: z
      .object({ fullName: z.string().nullable(), email: z.string().nullable(), phone: z.string().nullable(), links: z.array(z.string()) })
      .strict(),
    fields: z.array(Field).max(100),
    coverLetter: z.string().max(20_000).nullable(),
    // Optional preserves the canonical payload hash of application versions created before v15.
    personalization: PersonalizationBinding.nullable().optional(),
    attachments: z.array(Attachment).max(10),
    /** Questions the employer asks that Career Strike never answers (e.g. voluntary demographics). */
    notAnswered: z.array(z.string()).max(50),
  })
  .strict();

export type ApplicationPayload = z.infer<typeof ApplicationPayload>;
export type PayloadField = z.infer<typeof Field>;

/** JSON with object keys sorted at every level, so equal payloads always hash equally. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function payloadHash(payload: ApplicationPayload): string {
  return createHash('sha256').update(canonicalJson(payload)).digest('hex');
}

export function identityHash(payload: ApplicationPayload): string {
  return createHash('sha256').update(canonicalJson(payload.identity)).digest('hex');
}

/** Human-readable list of what personal information this payload discloses to the employer. */
export function disclosures(payload: ApplicationPayload): string[] {
  const out: string[] = [];
  if (payload.identity.fullName) out.push('Your full name');
  if (payload.identity.email) out.push('Your email address');
  if (payload.identity.phone) out.push('Your phone number');
  if (payload.identity.links.length) out.push(`Profile links (${payload.identity.links.length})`);
  for (const a of payload.attachments) out.push(`${a.kind === 'resume' ? 'Résumé' : a.kind === 'cover_letter' ? 'Cover letter file' : 'File'}: ${a.filename}`);
  if (payload.coverLetter) out.push('Cover letter text');
  // The cover letter is listed once above, even though it is also a form field.
  const answered = payload.fields.filter((f) => (f.source === 'draft' || f.source === 'candidate') && f.value && f.key !== 'cover_letter_text');
  if (answered.length) out.push(`Answers to ${answered.length} question${answered.length === 1 ? '' : 's'}`);
  return out;
}

/** Required fields without a value. An application with any of these cannot be marked ready. */
export function missingRequired(payload: ApplicationPayload): string[] {
  return payload.fields.filter((f) => f.required && (f.value === null || f.value.trim() === '')).map((f) => f.label);
}
