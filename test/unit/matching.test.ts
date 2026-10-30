import { describe, expect, it } from 'vitest';
import { experienceYears, type CandidateProfile } from '../../src/career/profile.js';
import { evaluateFit, type FitJob, type FitSettings } from '../../src/matching/fit.js';
import { extractRequirements } from '../../src/matching/requirements.js';
import { canonicalSkill, skillsIn } from '../../src/matching/skills.js';
import type { TextBlock } from '../../src/sources/types.js';

const P = (text: string): TextBlock => ({ type: 'paragraph', text });
const H = (text: string): TextBlock => ({ type: 'heading', text });
const I = (text: string): TextBlock => ({ type: 'item', text });

const POSTING: TextBlock[] = [
  H('About the team'),
  P('We use Kafka and Snowflake across the company.'),
  H('What you will do'),
  I('Build services in Go'),
  H('Requirements'),
  I('5+ years of backend experience'),
  I('Strong TypeScript and Node.js'),
  I('Experience operating Kubernetes in production'),
  H('Nice to have'),
  I('Terraform'),
  P('We are hiring urgently and need an immediate joiner.'),
  P('This role is remote but you must be based in India or the UAE.'),
];

describe('skill recognition', () => {
  it('recognises aliases with word boundaries and avoids common-word false positives', () => {
    expect(skillsIn('We run k8s, Postgres and Node.js')).toEqual(expect.arrayContaining(['Kubernetes', 'PostgreSQL', 'Node.js']));
    expect(skillsIn('You will excel at this and react quickly; go further')).toEqual([]);
    expect(skillsIn('Experience with React and Excel')).toEqual(expect.arrayContaining(['React', 'Excel']));
    expect(skillsIn('Java developers')).toEqual(['Java']);
    expect(skillsIn('JavaScript only')).not.toContain('Java');
    expect(skillsIn('C++ and C#')).toEqual(expect.arrayContaining(['C++', 'C#']));
  });

  it('canonicalises exactly what the candidate typed, or nothing', () => {
    expect(canonicalSkill(' k8s ')).toBe('Kubernetes');
    expect(canonicalSkill('golang')).toBe('Go');
    expect(canonicalSkill('Kubernetes operator patterns')).toBeNull();
  });
});

describe('requirement extraction', () => {
  const req = extractRequirements('Senior Backend Engineer', POSTING);

  it('classifies skills by section and keeps the quoted sentence', () => {
    const by = Object.fromEntries(req.skills.map((s) => [s.skill, s]));
    expect(by.TypeScript).toMatchObject({ importance: 'required', evidence: 'Strong TypeScript and Node.js' });
    expect(by.Kubernetes!.importance).toBe('required');
    expect(by.Terraform!.importance).toBe('preferred');
    expect(by['Apache Kafka']!.importance).toBe('mentioned');
    // A bare "Go" is an ordinary word; only "Golang" or "Go language" would count.
    expect(by.Go).toBeUndefined();
  });

  it('extracts years, seniority, urgency and location constraints only from what is written', () => {
    expect(req.yearsRequired).toEqual({ min: 5, evidence: '5+ years of backend experience' });
    expect(req.seniority).toEqual({ level: 'senior', evidence: 'Senior Backend Engineer' });
    expect(req.urgency).toEqual(['We are hiring urgently and need an immediate joiner.']);
    expect(req.locationConstraints).toEqual(['This role is remote but you must be based in India or the UAE.']);
    const quiet = extractRequirements('Analyst', [P('Join a friendly team.')]);
    expect(quiet).toMatchObject({ yearsRequired: null, seniority: null, urgency: [], locationConstraints: [], skills: [] });
  });

  it('does not treat preferred years as required', () => {
    expect(extractRequirements('Engineer', [H('Nice to have'), I('10+ years with Rust')]).yearsRequired).toBeNull();
    expect(extractRequirements('Engineer', [H('Requirements'), I('Ideally 3 years of Python')]).yearsRequired).toBeNull();
  });
});

describe('experience years', () => {
  it('counts overlapping roles once and open-ended roles to the current year', () => {
    expect(experienceYears([{ startYear: 2015, endYear: 2019 }, { startYear: 2018, endYear: 2021 }, { startYear: 2022, endYear: null }], 2026)).toBe(10);
  });
});

const settings = (over: Partial<FitSettings> = {}): FitSettings => ({
  preferredRoles: ['Backend Engineer'],
  remotePreference: 'remote_only',
  employmentTypes: ['full_time'],
  country: 'IN',
  eligibleCountries: [],
  joiningAvailability: 'immediate',
  salaryExpectation: null,
  excludedEmployers: [],
  ...over,
});

const profile = (over: Partial<CandidateProfile> = {}): CandidateProfile => ({
  skills: ['TypeScript', 'Node.js', 'Kubernetes', 'Apache Kafka'].map((name, i) => ({ name, years: 5, level: null, factId: `f${i}` })),
  roles: [{ title: 'Backend Engineer', employer: 'Synthetic Co', startYear: 2018, endYear: null, factId: 'r1' }],
  totalYears: 8,
  ...over,
});

const job = (over: Partial<FitJob> = {}): FitJob => ({
  title: 'Senior Backend Engineer',
  employer: 'Synthetic Labs',
  locationText: 'Remote - India',
  remotePolicy: 'remote',
  employmentType: 'full_time',
  salary: null,
  status: 'OPEN',
  descriptionText: POSTING.map((b) => b.text).join('\n'),
  requirements: extractRequirements('Senior Backend Engineer', POSTING),
  ...over,
});

const factor = (fit: ReturnType<typeof evaluateFit>, id: string) => fit.factors.find((f) => f.id === id)!;

describe('fit evaluation', () => {
  it('a complete match is strong, and every factor cites labelled evidence', () => {
    const fit = evaluateFit(job(), profile(), settings());
    expect(fit.tier).toBe('strong');
    expect(fit.tierRule).toBe('Your skills meet the posting and nothing else is a gap.');
    expect(fit.matchedSkills).toEqual(expect.arrayContaining(['TypeScript', 'Node.js', 'Kubernetes']));
    expect(fit.missingRequiredSkills).toEqual([]);
    expect(fit.transferableSkills).toContain('Apache Kafka');
    expect(factor(fit, 'eligibility')).toMatchObject({ verdict: 'meets' });
    expect(factor(fit, 'experience')).toMatchObject({ verdict: 'meets' });
    expect(factor(fit, 'experience').evidence.map((e) => e.source)).toEqual(['posting', 'inferred']);
    expect(factor(fit, 'start')).toMatchObject({ verdict: 'meets' });
    expect(fit.immediateStart).toEqual({ asked: true, candidateAvailable: true });
    for (const f of fit.factors) for (const e of f.evidence) expect(['posting', 'profile', 'settings', 'inferred']).toContain(e.source);
    // No percentage or score anywhere in the explanation.
    expect(JSON.stringify(fit)).not.toMatch(/%|score/i);
  });

  it('missing required skills make it partial or a gap, naming the skills', () => {
    const fit = evaluateFit(job(), profile({ skills: [{ name: 'TypeScript', years: 2, level: null, factId: 'f' }] }), settings());
    expect(factor(fit, 'skills')).toMatchObject({ verdict: 'gap', detail: expect.stringContaining('missing Kubernetes, Node.js') });
    expect(fit.tier).not.toBe('strong');
  });

  it('only countries the posting names decide eligibility; unnamed remote is unknown, not eligible', () => {
    expect(factor(evaluateFit(job(), profile(), settings({ country: 'DE' })), 'eligibility').verdict).toBe('gap');
    expect(evaluateFit(job(), profile(), settings({ country: 'DE' })).tier).toBe('ineligible');
    const unnamed = job({ locationText: 'Remote', requirements: { ...job().requirements, locationConstraints: [] } });
    expect(factor(evaluateFit(unnamed, profile(), settings()), 'eligibility')).toMatchObject({ verdict: 'unknown', detail: expect.stringContaining('does not say which countries') });
    expect(factor(evaluateFit(job(), profile(), settings({ country: null })), 'eligibility').verdict).toBe('unknown');
  });

  it('salary is compared only when published in the same currency and comparable intervals', () => {
    const pay = { currency: 'INR', min: 3_000_000, max: 4_000_000, interval: 'year' as const, source: 'structured' as const };
    const s = (minimum: number, currency = 'INR', interval: 'year' | 'month' | 'hour' = 'year') => settings({ salaryExpectation: { currency, minimum, interval } });
    expect(factor(evaluateFit(job(), profile(), s(1)), 'salary')).toMatchObject({ verdict: 'unknown', detail: expect.stringContaining('never estimates') });
    expect(factor(evaluateFit(job({ salary: pay }), profile(), s(2_500_000)), 'salary').verdict).toBe('meets');
    expect(factor(evaluateFit(job({ salary: pay }), profile(), s(3_500_000)), 'salary').verdict).toBe('partial');
    expect(factor(evaluateFit(job({ salary: pay }), profile(), s(5_000_000)), 'salary').verdict).toBe('gap');
    expect(factor(evaluateFit(job({ salary: pay }), profile(), s(250_000, 'INR', 'month')), 'salary').verdict).toBe('meets');
    expect(factor(evaluateFit(job({ salary: pay }), profile(), s(30_000, 'USD')), 'salary').verdict).toBe('unknown');
    expect(factor(evaluateFit(job({ salary: pay }), profile(), s(1000, 'INR', 'hour')), 'salary').verdict).toBe('unknown');
  });

  it('immediate-start priority needs both quoted posting text and the candidate’s availability', () => {
    expect(factor(evaluateFit(job(), profile(), settings({ joiningAvailability: 'two_months_plus' })), 'start').verdict).toBe('gap');
    expect(factor(evaluateFit(job(), profile(), settings({ joiningAvailability: 'unspecified' })), 'start').verdict).toBe('unknown');
    const noUrgency = job({ requirements: { ...job().requirements, urgency: [] } });
    expect(evaluateFit(noUrgency, profile(), settings()).immediateStart.asked).toBe(false);
  });

  it('closed postings, excluded employers and empty profiles produce explained tiers', () => {
    expect(evaluateFit(job({ status: 'CLOSED' }), profile(), settings())).toMatchObject({ tier: 'ineligible', tierRule: 'The posting has closed.' });
    expect(evaluateFit(job(), profile(), settings({ excludedEmployers: ['synthetic labs'] }))).toMatchObject({ tier: 'ineligible', tierRule: 'You excluded this employer in Settings.' });
    expect(evaluateFit(job(), profile({ skills: [], roles: [], totalYears: null }), settings())).toMatchObject({ tier: 'unknown' });
  });

  it('loose mentions without a required list are only partial evidence', () => {
    const blocks = [P('Our stack: Python, Kubernetes, Kafka, Terraform, Rust and Snowflake.')];
    const loose = job({ requirements: extractRequirements('Engineer', blocks), descriptionText: blocks[0]!.text });
    const two = profile({ skills: ['Python', 'Kubernetes'].map((name, i) => ({ name, years: 3, level: null, factId: `s${i}` })) });
    expect(factor(evaluateFit(loose, two, settings()), 'skills')).toMatchObject({ verdict: 'partial', detail: expect.stringContaining('mentions 6 skills') });
    expect(evaluateFit(loose, two, settings()).tier).not.toBe('strong');
    const four = profile({ skills: ['Python', 'Kubernetes', 'Apache Kafka', 'Terraform'].map((name, i) => ({ name, years: 3, level: null, factId: `s${i}` })) });
    expect(factor(evaluateFit(loose, four, settings()), 'skills').verdict).toBe('meets');
  });

  it('recognises common qualification headings as required sections', () => {
    const r = extractRequirements('Engineer', [P('You might thrive in this role if you:'), I('Have shipped Rust services')]);
    expect(r.skills).toEqual([expect.objectContaining({ skill: 'Rust', importance: 'required' })]);
  });

  it('a career change is labelled honestly rather than hidden', () => {
    const fit = evaluateFit(job({ title: 'Solutions Architect' }), profile(), settings());
    expect(factor(fit, 'role')).toMatchObject({ verdict: 'gap', detail: expect.stringContaining('career change') });
    expect(fit.matchedSkills.length).toBeGreaterThan(0);
  });
});
