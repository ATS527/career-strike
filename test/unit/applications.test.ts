import { describe, expect, it } from 'vitest';
import { buildDraft, DEFAULT_QUESTIONS, type DraftInput, factGuard } from '../../src/applications/drafts.js';
import { canonicalJson, disclosures, missingRequired, payloadHash } from '../../src/applications/payload.js';
import { APPLICATION_STATES, allowedTransitions, canTransition, isSubmitted, isTerminal } from '../../src/applications/states.js';
import type { CandidateProfile } from '../../src/career/profile.js';
import type { Fit } from '../../src/matching/fit.js';
import { createAdapters } from '../../src/sources/adapters.js';
import { fakeFetch } from '../fixtures/ats.js';

describe('application state machine', () => {
  it('never reaches a submitted state without going through approval and a submission step', () => {
    // Breadth-first search from DRAFTED: every path to SUBMITTED_CONFIRMED passes through APPROVED.
    const reachableWithoutApproval = new Set<string>(['DRAFTED']);
    const queue = ['DRAFTED'];
    while (queue.length) {
      const s = queue.shift()!;
      for (const next of allowedTransitions(s as never)) {
        if (next === 'APPROVED' || reachableWithoutApproval.has(next)) continue;
        reachableWithoutApproval.add(next);
        queue.push(next);
      }
    }
    for (const s of APPLICATION_STATES.filter(isSubmitted)) expect(reachableWithoutApproval.has(s), s).toBe(false);
  });

  it('allows the documented lifecycle and refuses shortcuts', () => {
    expect(canTransition('DRAFTED', 'READY_FOR_REVIEW')).toBe(true);
    expect(canTransition('READY_FOR_REVIEW', 'APPROVED')).toBe(true);
    expect(canTransition('APPROVED', 'NEEDS_MANUAL_ACTION')).toBe(true);
    expect(canTransition('NEEDS_MANUAL_ACTION', 'SUBMITTED_CONFIRMED')).toBe(true);
    expect(canTransition('DRAFTED', 'APPROVED')).toBe(false);
    expect(canTransition('DRAFTED', 'SUBMITTED_CONFIRMED')).toBe(false);
    expect(canTransition('SUBMISSION_UNCONFIRMED', 'SUBMISSION_IN_PROGRESS')).toBe(false);
    expect(canTransition('SUBMISSION_FAILED', 'SUBMISSION_IN_PROGRESS')).toBe(false);
    expect(canTransition('INTERVIEW', 'INTERVIEW')).toBe(true);
  });

  it('has terminal states with no way out', () => {
    for (const s of ['REJECTED', 'WITHDRAWN', 'CLOSED', 'EXPIRED', 'DUPLICATE', 'CANCELLED'] as const) expect(isTerminal(s)).toBe(true);
    for (const s of APPLICATION_STATES) for (const t of allowedTransitions(s)) expect(APPLICATION_STATES).toContain(t);
  });
});

const profile: CandidateProfile = {
  skills: [
    { name: 'TypeScript', years: 6, level: null, factId: 'f-ts' },
    { name: 'Kubernetes', years: null, level: null, factId: 'f-k8s' },
  ],
  roles: [{ title: 'Platform Engineer', employer: 'Synthetic Co', startYear: 2019, endYear: null, factId: 'f-role' }],
  totalYears: 7,
};

const fit = { matchedSkills: ['TypeScript', 'Kubernetes'], missingRequiredSkills: ['Rust'], immediateStart: { asked: true, candidateAvailable: true } } as unknown as Fit;

const input = (over: Partial<DraftInput> = {}): DraftInput => ({
  job: { id: 'job_1', canonicalKey: 'greenhouse:synthetic:1', employer: 'Synthetic Labs', title: 'Senior Platform Engineer', applyUrl: 'https://careers.example.com/1' },
  questions: null,
  identity: { fullName: 'Jordan Example', email: 'jordan@example.com', phone: '+1 555 0100', links: ['https://www.linkedin.com/in/example'] },
  profile,
  fit,
  joiningAvailability: 'immediate',
  resume: { id: 'doc_1', kind: 'resume', filename: 'resume.pdf', mime: 'application/pdf', sizeBytes: 10, sha256: 'a'.repeat(64), createdAt: 'x' },
  ...over,
});

describe('drafts', () => {
  it('state only facts from the approved profile, citing them, and never claim missing skills', () => {
    const { payload, claims } = buildDraft(input(), 'manual');
    const letter = payload.coverLetter!;
    expect(letter).toContain('I have worked as Platform Engineer at Synthetic Co since 2019.');
    expect(letter).toContain('TypeScript (6 years) and Kubernetes');
    expect(letter).not.toContain('Kubernetes (');
    expect(letter).not.toContain('Rust');
    expect(letter).toContain('I am available to start immediately.');
    expect(claims.find((c) => c.text.startsWith('I have worked as'))!.factIds).toEqual(['f-role']);
    expect(claims.find((c) => c.text.includes('TypeScript'))!.factIds).toEqual(['f-ts', 'f-k8s']);
    expect(factGuard(letter, profile)).toEqual([]);
  });

  it('fills standard fields from identity and documents and leaves nothing invented', () => {
    const { payload } = buildDraft(input(), 'manual');
    const field = (k: string) => payload.fields.find((f) => f.key === k)!;
    expect(field('full_name')).toMatchObject({ value: 'Jordan Example', source: 'identity' });
    expect(field('resume')).toMatchObject({ value: 'resume.pdf', source: 'document', kind: 'file' });
    expect(payload.attachments).toEqual([{ documentId: 'doc_1', kind: 'resume', filename: 'resume.pdf', sha256: 'a'.repeat(64) }]);
    expect(missingRequired(payload)).toEqual([]);
    expect(disclosures(payload)).toEqual(['Your full name', 'Your email address', 'Your phone number', 'Profile links (1)', 'Résumé: resume.pdf', 'Cover letter text']);

    const bare = buildDraft(input({ identity: { fullName: null, email: null, phone: null, links: [] }, resume: null }), 'manual').payload;
    expect(missingRequired(bare)).toEqual(['Full name', 'Email', 'Résumé/CV']);
    expect(bare.coverLetter).toContain('[Your name]');
  });

  it('maps employer form questions and never answers voluntary or employer-specific ones', () => {
    const questions = [
      ...DEFAULT_QUESTIONS.filter((q) => q.key === 'email'),
      { key: 'first_name', label: 'First Name', required: true, kind: 'text' as const, options: [], voluntary: false },
      { key: 'last_name', label: 'Last Name', required: true, kind: 'text' as const, options: [], voluntary: false },
      { key: 'question_1', label: 'LinkedIn Profile', required: false, kind: 'text' as const, options: [], voluntary: false },
      { key: 'question_2', label: 'Why do you want to work here?', required: true, kind: 'long_text' as const, options: [], voluntary: false },
      { key: 'voluntary:Gender', label: 'Gender', required: false, kind: 'choice' as const, options: [], voluntary: true },
    ];
    const { payload } = buildDraft(input({ questions }), 'manual');
    expect(payload.fields.map((f) => [f.key, f.value])).toEqual([
      ['email', 'jordan@example.com'],
      ['first_name', 'Jordan'],
      ['last_name', 'Example'],
      ['question_1', 'https://www.linkedin.com/in/example'],
      ['question_2', null],
    ]);
    expect(payload.notAnswered).toEqual(['Gender']);
    // This form does not ask for a phone number, so the phone is not part of what is disclosed.
    expect(payload.identity).toEqual({ fullName: 'Jordan Example', email: 'jordan@example.com', phone: null, links: ['https://www.linkedin.com/in/example'] });
    expect(disclosures(payload)).not.toContain('Your phone number');
    expect(missingRequired(payload)).toEqual(['Why do you want to work here?']);
  });

  it('the fact guard flags unlisted skills and inflated years in edited text', () => {
    const warnings = factGuard('I have 15 years of Rust and TypeScript experience.', profile);
    expect(warnings.map((w) => w.kind)).toEqual(['unlisted-skill', 'years-exceed-profile']);
    expect(warnings[0]!.message).toBe('Mentions Rust, which is not in your profile.');
  });
});

describe('payload hashing', () => {
  it('is independent of key order and changes with any material change', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { y: 1, x: 2 }], c: null } })).toBe('{"a":{"c":null,"d":[2,{"x":2,"y":1}]},"b":1}');
    const { payload } = buildDraft(input(), 'manual');
    const h = payloadHash(payload);
    expect(payloadHash(JSON.parse(JSON.stringify(payload)))).toBe(h);
    const variants = [
      { ...payload, coverLetter: `${payload.coverLetter} ` },
      { ...payload, destination: { ...payload.destination, url: 'https://evil.example/apply' } },
      { ...payload, identity: { ...payload.identity, email: 'other@example.com' } },
      { ...payload, attachments: [{ ...payload.attachments[0]!, sha256: 'b'.repeat(64) }] },
    ];
    for (const v of variants) expect(payloadHash(v)).not.toBe(h);
  });
});

describe('Greenhouse application form', () => {
  it('reads published questions, prefers file fields, skips hidden ones and marks demographics voluntary', async () => {
    const adapters = createAdapters(
      fakeFetch({
        'boards-api.greenhouse.io': {
          questions: [
            { label: 'First Name', required: true, fields: [{ name: 'first_name', type: 'input_text', values: [] }] },
            { label: 'Resume/CV', required: true, fields: [{ name: 'resume_text', type: 'textarea', values: [] }, { name: 'resume', type: 'input_file', values: [] }] },
            { label: 'Visa sponsorship?', required: true, fields: [{ name: 'q9', type: 'multi_value_single_select', values: [{ label: 'Yes' }, { label: 'No' }] }] },
          ],
          location_questions: [{ label: 'Latitude', required: true, fields: [{ name: 'latitude', type: 'input_hidden', values: [] }] }],
          demographic_questions: { header: 'Voluntary', questions: [{ label: 'Gender' }] },
          compliance: 'unexpected shape',
        },
      }),
    );
    const qs = await adapters.greenhouse.applicationQuestions!('synthetic', '123');
    expect(qs).toEqual([
      { key: 'first_name', label: 'First Name', required: true, kind: 'text', options: [], voluntary: false },
      { key: 'resume', label: 'Resume/CV', required: true, kind: 'file', options: [], voluntary: false },
      { key: 'q9', label: 'Visa sponsorship?', required: true, kind: 'choice', options: ['Yes', 'No'], voluntary: false },
      { key: 'voluntary:Gender', label: 'Gender', required: false, kind: 'choice', options: [], voluntary: true },
    ]);
    await expect(adapters.greenhouse.applicationQuestions!('synthetic', '../1')).rejects.toThrow();
    // Responses that omit optional sections entirely still parse.
    const minimal = createAdapters(fakeFetch({ 'boards-api.greenhouse.io': { questions: [{ label: 'Email', fields: [{ name: 'email', type: 'input_text' }] }] } }));
    expect(await minimal.greenhouse.applicationQuestions!('synthetic', '1')).toEqual([
      { key: 'email', label: 'Email', required: false, kind: 'text', options: [], voluntary: false },
    ]);
  });
});
