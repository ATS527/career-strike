import type { CandidateProfile } from '../career/profile.js';
import type { Fit } from '../matching/fit.js';
import { skillsIn } from '../matching/skills.js';
import type { StoredDocument } from '../vault/documents.js';
import type { ApplicationPayload, PayloadField } from './payload.js';

/** A question on the employer's application form, as published by the ATS. */
export interface FormQuestion {
  key: string;
  label: string;
  required: boolean;
  kind: PayloadField['kind'];
  options: string[];
  /** Voluntary questions (e.g. demographics) are never answered by Career Strike. */
  voluntary: boolean;
}

export interface Identity {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  links: string[];
}

export interface DraftInput {
  job: { id: string; canonicalKey: string; employer: string; title: string; applyUrl: string | null };
  questions: FormQuestion[] | null;
  identity: Identity;
  profile: CandidateProfile;
  fit: Fit | null;
  joiningAvailability: string;
  resume: StoredDocument | null;
}

/** A sentence of the generated draft and the profile facts it rests on. */
export interface Claim {
  text: string;
  factIds: string[];
}

export const DEFAULT_QUESTIONS: FormQuestion[] = [
  { key: 'full_name', label: 'Full name', required: true, kind: 'text', options: [], voluntary: false },
  { key: 'email', label: 'Email', required: true, kind: 'text', options: [], voluntary: false },
  { key: 'phone', label: 'Phone', required: false, kind: 'text', options: [], voluntary: false },
  { key: 'resume', label: 'Résumé/CV', required: true, kind: 'file', options: [], voluntary: false },
  { key: 'cover_letter_text', label: 'Cover letter', required: false, kind: 'long_text', options: [], voluntary: false },
  { key: 'links', label: 'Profile links', required: false, kind: 'text', options: [], voluntary: false },
];

const AVAILABILITY_SENTENCE: Record<string, string> = {
  immediate: 'I am available to start immediately.',
  two_weeks: 'I am available to start within two weeks.',
  one_month: 'I am available to start within a month.',
};

/**
 * A cover letter built only from approved profile facts. It names skills the posting asks for
 * only when the candidate listed them, states years only when the candidate gave them, and never
 * mentions missing skills as if the candidate had them.
 */
export function draftCoverLetter(input: DraftInput): { text: string; claims: Claim[] } {
  const claims: Claim[] = [];
  const { job, profile, fit, identity } = input;
  claims.push({ text: `I am applying for the ${job.title} role at ${job.employer}.`, factIds: [] });

  const latest = [...profile.roles].sort((a, b) => (b.endYear ?? 9999) - (a.endYear ?? 9999) || b.startYear - a.startYear)[0];
  if (latest) {
    const where = latest.employer ? ` at ${latest.employer}` : '';
    const when = latest.endYear === null ? `since ${latest.startYear}` : `from ${latest.startYear} to ${latest.endYear}`;
    claims.push({ text: `I have worked as ${latest.title}${where} ${when}.`, factIds: [latest.factId] });
  }

  const matched = (fit?.matchedSkills ?? []).map((name) => profile.skills.find((s) => s.name === name)).filter((s): s is NonNullable<typeof s> => !!s);
  if (matched.length > 0) {
    const parts = matched.slice(0, 5).map((s) => (s.years ? `${s.name} (${s.years} ${s.years === 1 ? 'year' : 'years'})` : s.name));
    const list = parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)!}`;
    claims.push({ text: `The role asks for experience I have: ${list}.`, factIds: matched.slice(0, 5).map((s) => s.factId) });
  }

  if (fit?.immediateStart.asked && AVAILABILITY_SENTENCE[input.joiningAvailability]) {
    claims.push({ text: AVAILABILITY_SENTENCE[input.joiningAvailability]!, factIds: [] });
  }
  claims.push({ text: 'I would welcome the chance to discuss how I can contribute.', factIds: [] });

  const body = [`Dear ${job.employer} hiring team,`, '', claims.map((c) => c.text).join(' '), '', 'Kind regards,', identity.fullName ?? '[Your name]'].join('\n');
  return { text: body, claims };
}

function splitName(full: string | null): [string | null, string | null] {
  if (!full) return [null, null];
  const parts = full.trim().split(/\s+/);
  return parts.length === 1 ? [parts[0]!, null] : [parts.slice(0, -1).join(' '), parts.at(-1)!];
}

/** Fill a form question from identity, documents or the draft; anything else is left for the candidate. */
function fillQuestion(q: FormQuestion, input: DraftInput, coverLetter: string): PayloadField {
  const [first, last] = splitName(input.identity.fullName);
  const base = { key: q.key, label: q.label, required: q.required, kind: q.kind, options: q.options };
  const fromIdentity = (value: string | null): PayloadField => ({ ...base, source: value ? 'identity' : 'empty', value });
  const label = q.label.toLowerCase();
  if (q.key === 'first_name') return fromIdentity(first);
  if (q.key === 'last_name') return fromIdentity(last);
  if (q.key === 'full_name') return fromIdentity(input.identity.fullName);
  if (q.key === 'email') return fromIdentity(input.identity.email);
  if (q.key === 'phone') return fromIdentity(input.identity.phone);
  if (q.key === 'links') return fromIdentity(input.identity.links.join('\n') || null);
  if (q.key === 'resume' || (q.kind === 'file' && /resume|cv/.test(label))) {
    return { ...base, kind: 'file', source: input.resume ? 'document' : 'empty', value: input.resume?.filename ?? null };
  }
  if (q.key === 'cover_letter_text' || q.key === 'cover_letter' || /cover letter/.test(label)) {
    return { ...base, key: 'cover_letter_text', kind: 'long_text', source: 'draft', value: coverLetter };
  }
  if (/linkedin/.test(label)) return fromIdentity(input.identity.links.find((l) => /linkedin\.com/i.test(l)) ?? null);
  if (/github/.test(label)) return fromIdentity(input.identity.links.find((l) => /github\.com/i.test(l)) ?? null);
  if (/website|portfolio/.test(label)) return fromIdentity(input.identity.links.find((l) => !/linkedin|github/i.test(l)) ?? null);
  // Employer-specific questions are the candidate's to answer.
  return { ...base, source: 'empty', value: null };
}

export function buildDraft(input: DraftInput, method: 'manual' | 'assisted' | 'test-ats'): { payload: ApplicationPayload; claims: Claim[] } {
  const letter = draftCoverLetter(input);
  const questions = input.questions ?? DEFAULT_QUESTIONS;
  const fields = questions.filter((q) => !q.voluntary).map((q) => fillQuestion(q, input, letter.text));
  const coverField = fields.find((f) => f.key === 'cover_letter_text');
  // Disclose only identity details the employer's form actually asks for.
  const used = (keys: string[], labels: RegExp): boolean => fields.some((f) => keys.includes(f.key) || labels.test(f.label.toLowerCase()));
  const identity: Identity = {
    fullName: used(['full_name', 'first_name', 'last_name'], /\bname\b/) ? input.identity.fullName : null,
    email: used(['email'], /\be-?mail\b/) ? input.identity.email : null,
    phone: used(['phone'], /\bphone\b/) ? input.identity.phone : null,
    links: used(['links'], /linkedin|github|website|portfolio/) ? input.identity.links : [],
  };
  return {
    claims: letter.claims,
    payload: {
      job: { id: input.job.id, canonicalKey: input.job.canonicalKey, employer: input.job.employer, title: input.job.title },
      destination: { method, url: input.job.applyUrl },
      identity,
      fields,
      // No cover-letter field on the employer's form means no cover letter is sent.
      coverLetter: coverField ? coverField.value : null,
      attachments: input.resume ? [{ documentId: input.resume.id, kind: 'resume', filename: input.resume.filename, sha256: input.resume.sha256 }] : [],
      notAnswered: questions.filter((q) => q.voluntary).map((q) => q.label),
    },
  };
}

export interface GuardWarning {
  kind: 'unlisted-skill' | 'years-exceed-profile';
  message: string;
}

/**
 * Flag statements in candidate-edited text that the approved profile does not support. The
 * candidate may still keep them — it is their application — but must confirm before approving.
 */
export function factGuard(text: string, profile: CandidateProfile): GuardWarning[] {
  const warnings: GuardWarning[] = [];
  const have = new Set(profile.skills.map((s) => s.name.toLowerCase()));
  for (const skill of skillsIn(text)) {
    if (!have.has(skill.toLowerCase())) warnings.push({ kind: 'unlisted-skill', message: `Mentions ${skill}, which is not in your profile.` });
  }
  const maxYears = Math.max(profile.totalYears ?? 0, ...profile.skills.map((s) => s.years ?? 0));
  for (const m of text.matchAll(/\b(\d{1,2})\s*\+?\s*(?:years|yrs)\b/gi)) {
    const n = Number(m[1]);
    if (n > maxYears) {
      warnings.push({ kind: 'years-exceed-profile', message: `Claims ${n} years; your profile supports about ${maxYears}.` });
      break;
    }
  }
  return warnings;
}
