import type { CandidateProfile } from '../career/profile.js';
import type { PublishedSalary, RemotePolicy } from '../sources/types.js';
import type { PostingRequirements } from './requirements.js';
import { mentions } from './skills.js';

export type Verdict = 'meets' | 'partial' | 'gap' | 'unknown';
export type EvidenceSource = 'posting' | 'profile' | 'settings' | 'inferred';

export interface Evidence {
  source: EvidenceSource;
  text: string;
}

export interface FitFactor {
  id: 'eligibility' | 'arrangement' | 'employment' | 'skills' | 'experience' | 'role' | 'salary' | 'start' | 'freshness';
  label: string;
  verdict: Verdict;
  detail: string;
  evidence: Evidence[];
  /** Hard factors can make a role ineligible; soft ones only affect the tier. */
  hard: boolean;
}

export type Tier = 'strong' | 'possible' | 'stretch' | 'ineligible' | 'unknown';

export interface Fit {
  tier: Tier;
  /** The named rule that produced the tier, shown verbatim to the candidate. */
  tierRule: string;
  factors: FitFactor[];
  matchedSkills: string[];
  missingRequiredSkills: string[];
  /** Candidate skills the posting mentions under another heading or by the candidate's own wording. */
  transferableSkills: string[];
  immediateStart: { asked: boolean; candidateAvailable: boolean | null };
}

export interface FitJob {
  title: string;
  employer: string;
  locationText: string | null;
  remotePolicy: RemotePolicy;
  employmentType: string;
  salary: PublishedSalary | null;
  status: 'OPEN' | 'STALE' | 'CLOSED' | 'UNVERIFIED';
  descriptionText: string;
  requirements: PostingRequirements;
}

export interface FitSettings {
  preferredRoles: string[];
  remotePreference: 'remote_only' | 'hybrid_ok' | 'onsite_ok';
  employmentTypes: string[];
  country: string | null;
  eligibleCountries: string[];
  joiningAvailability: string;
  salaryExpectation: { currency: string; minimum: number; interval: 'year' | 'month' | 'hour' } | null;
  excludedEmployers: string[];
}

// ---- countries ----

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const ALIASES: Readonly<Record<string, string[]>> = {
  US: ['USA', 'U.S.', 'U.S.A.', 'United States of America', 'America'],
  GB: ['UK', 'U.K.', 'Britain', 'England', 'Scotland', 'Wales'],
  AE: ['UAE', 'U.A.E.', 'Dubai', 'Abu Dhabi'],
  IN: ['Bengaluru', 'Bangalore', 'Mumbai', 'Delhi', 'Hyderabad', 'Pune', 'Chennai', 'Gurugram', 'Gurgaon', 'Noida', 'Kochi', 'Kolkata'],
  DE: ['Berlin', 'Munich', 'München', 'Hamburg', 'Frankfurt'],
  NL: ['Holland', 'Amsterdam', 'Rotterdam'],
  FR: ['Paris'],
  ES: ['Madrid', 'Barcelona'],
  IE: ['Dublin'],
  CA: ['Toronto', 'Vancouver', 'Montreal', 'Montréal'],
  AU: ['Sydney', 'Melbourne'],
  SG: ['Singapore'],
  JP: ['Tokyo'],
  CH: ['Zurich', 'Zürich', 'Geneva'],
  SE: ['Stockholm'],
  PL: ['Warsaw', 'Kraków', 'Krakow'],
  PT: ['Lisbon'],
  BR: ['São Paulo', 'Sao Paulo'],
};
const US_CITIES = ['San Francisco', 'New York', 'NYC', 'Seattle', 'Austin', 'Boston', 'Chicago', 'Los Angeles', 'Denver', 'Atlanta', 'Washington, DC'];
ALIASES.US!.push(...US_CITIES);
ALIASES.GB!.push('London', 'Manchester', 'Edinburgh');

// Withdrawn ISO codes (East Germany, USSR, Yugoslavia…) and private-use ranges still have names
// in ICU and would shadow current countries.
const WITHDRAWN_OR_PRIVATE = /^(AA|AN|BU|CS|DD|DY|EU|EZ|FX|HV|NH|NT|QM|Q[N-Z]|RH|SU|TP|UN|VD|X[A-JL-Z]|YD|YU|ZR|ZZ)$/;

// Country names that are also US states, given names or parts of other place names.
const AMBIGUOUS_NAMES = new Set(['Georgia', 'Jersey', 'Jordan', 'Chad', 'Guernsey']);

const COUNTRY_NAMES: readonly [string, string][] = (() => {
  const out: [string, string][] = [];
  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      const name = regionNames.of(code);
      // Unknown codes echo back; skip those, multi-country groupings and ambiguous names.
      if (WITHDRAWN_OR_PRIVATE.test(code)) continue;
      if (name && name !== code && !/\b(Union|World|Unknown|Region)\b/.test(name) && !AMBIGUOUS_NAMES.has(name)) out.push([code, name]);
    }
  }
  for (const [code, names] of Object.entries(ALIASES)) for (const n of names) out.push([code, n]);
  return out;
})();

// "City, ST" with a US state abbreviation. These collide with ISO codes (CA, IN, DE…), so a
// bare two-letter code is never read as a country.
const US_STATE =
  /,\s*(AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/;

/** ISO codes of countries a location text names, by country name, common alias or major city. */
export function countriesIn(text: string | null): string[] {
  if (!text) return [];
  const found = new Set<string>();
  for (const [code, name] of COUNTRY_NAMES) if (mentions(text, name)) found.add(code);
  if (US_STATE.test(text) || /(?<![A-Za-z])US(?![A-Za-z])/.test(text)) found.add('US');
  return [...found];
}

// ---- factors ----

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const STOP = new Set(['and', 'or', 'of', 'the', 'a', 'an', 'to', 'for', 'with', 'in', 'at', 'i', 'ii', 'iii', 'senior', 'junior', 'lead', 'staff', 'principal', 'sr', 'jr']);
const words = (s: string): string[] => norm(s).split(' ').filter((w) => w.length > 1 && !STOP.has(w));

function eligibility(job: FitJob, s: FitSettings): FitFactor {
  const allowed = new Set([...s.eligibleCountries, ...(s.country ? [s.country] : [])]);
  const named = countriesIn([job.locationText, ...job.requirements.locationConstraints].filter(Boolean).join(' · '));
  const evidence: Evidence[] = [];
  if (job.locationText) evidence.push({ source: 'posting', text: `Location: ${job.locationText}` });
  for (const c of job.requirements.locationConstraints) evidence.push({ source: 'posting', text: c });
  const base = { id: 'eligibility' as const, label: 'Where you can work', hard: true };

  if (allowed.size === 0) {
    return { ...base, verdict: 'unknown', detail: 'Add your country and where you can work to check eligibility.', evidence };
  }
  evidence.push({ source: 'settings', text: `You can work in: ${[...allowed].map((c) => regionNames.of(c) ?? c).join(', ')}` });
  if (named.length === 0) {
    const detail =
      job.remotePolicy === 'remote'
        ? 'Remote, but the posting does not say which countries are eligible.'
        : 'The posting’s location does not name a country Career Strike recognises.';
    return { ...base, verdict: 'unknown', detail, evidence };
  }
  const ok = named.filter((c) => allowed.has(c));
  if (ok.length > 0) {
    return { ...base, verdict: 'meets', detail: `The posting names ${ok.map((c) => regionNames.of(c) ?? c).join(', ')}, where you can work.`, evidence };
  }
  return {
    ...base,
    verdict: 'gap',
    detail: `The posting names ${named.map((c) => regionNames.of(c) ?? c).join(', ')}; none is a country you have said you can work in.`,
    evidence,
  };
}

function arrangement(job: FitJob, s: FitSettings): FitFactor {
  const base = { id: 'arrangement' as const, label: 'Work arrangement', hard: false };
  const pref = { remote_only: 'remote only', hybrid_ok: 'remote or hybrid', onsite_ok: 'any arrangement' }[s.remotePreference];
  const evidence: Evidence[] = [{ source: 'settings', text: `You want ${pref}.` }];
  if (job.remotePolicy === 'unknown') return { ...base, verdict: 'unknown', detail: 'The posting does not say whether it is remote, hybrid or on-site.', evidence };
  evidence.unshift({ source: 'posting', text: `Arrangement: ${job.remotePolicy}` });
  const acceptable =
    job.remotePolicy === 'remote' || s.remotePreference === 'onsite_ok' || (job.remotePolicy === 'hybrid' && s.remotePreference === 'hybrid_ok');
  return acceptable
    ? { ...base, verdict: 'meets', detail: `It is ${job.remotePolicy}, which fits your preference.`, evidence }
    : { ...base, verdict: 'gap', detail: `It is ${job.remotePolicy}; you asked for ${pref}.`, evidence };
}

function employment(job: FitJob, s: FitSettings): FitFactor {
  const base = { id: 'employment' as const, label: 'Employment type', hard: false };
  if (job.employmentType === 'unknown') return { ...base, verdict: 'unknown', detail: 'The posting does not state the employment type.', evidence: [] };
  const evidence: Evidence[] = [
    { source: 'posting', text: `Employment type: ${job.employmentType.replace('_', '-')}` },
    { source: 'settings', text: `You consider: ${s.employmentTypes.map((t) => t.replace('_', '-')).join(', ')}` },
  ];
  return s.employmentTypes.includes(job.employmentType)
    ? { ...base, verdict: 'meets', detail: 'This is a type of employment you are considering.', evidence }
    : { ...base, verdict: 'gap', detail: 'You have not said you would consider this type of employment.', evidence };
}

function skillsFactor(job: FitJob, profile: CandidateProfile): Pick<Fit, 'matchedSkills' | 'missingRequiredSkills' | 'transferableSkills'> & { factor: FitFactor } {
  const base = { id: 'skills' as const, label: 'Skills', hard: false };
  const have = new Map(profile.skills.map((sk) => [sk.name.toLowerCase(), sk]));
  const reqs = job.requirements.skills;
  const matched = reqs.filter((r) => have.has(r.skill.toLowerCase()));
  const missingRequired = reqs.filter((r) => r.importance === 'required' && !have.has(r.skill.toLowerCase()));
  // Candidate skills Career Strike does not know but the posting mentions in the candidate's own words.
  const known = new Set(reqs.map((r) => r.skill.toLowerCase()));
  const ownWords = profile.skills.filter((sk) => !known.has(sk.name.toLowerCase()) && sk.name.length >= 3 && mentions(job.descriptionText, sk.name));
  const transferable = [...matched.filter((r) => r.importance === 'mentioned').map((r) => r.skill), ...ownWords.map((s) => s.name)];

  const evidence: Evidence[] = [
    ...matched.slice(0, 6).map((r) => ({ source: 'posting' as const, text: `${r.skill} (${r.importance}): “${r.evidence}”` })),
    ...matched.slice(0, 6).map((r) => ({ source: 'profile' as const, text: `You listed ${have.get(r.skill.toLowerCase())!.name}${have.get(r.skill.toLowerCase())!.years ? ` (${have.get(r.skill.toLowerCase())!.years} yrs)` : ''}` })),
    ...missingRequired.slice(0, 6).map((r) => ({ source: 'posting' as const, text: `Asks for ${r.skill}: “${r.evidence}”` })),
    ...ownWords.slice(0, 3).map((s) => ({ source: 'profile' as const, text: `Your skill “${s.name}” appears in the posting text` })),
  ];
  const required = reqs.filter((r) => r.importance === 'required');

  let factor: FitFactor;
  if (profile.skills.length === 0) {
    factor = { ...base, verdict: 'unknown', detail: 'Add your skills to your profile to compare them with this posting.', evidence };
  } else if (reqs.length === 0 && ownWords.length === 0) {
    factor = { ...base, verdict: 'unknown', detail: 'Career Strike found no skills it recognises in this posting.', evidence };
  } else if (required.length > 0) {
    const covered = required.length - missingRequired.length;
    const verdict: Verdict = missingRequired.length === 0 ? 'meets' : covered / required.length >= 0.5 ? 'partial' : 'gap';
    factor = {
      ...base,
      verdict,
      detail: `You have ${covered} of the ${required.length} skills listed as required${missingRequired.length ? `; missing ${missingRequired.map((r) => r.skill).join(', ')}` : ''}.`,
      evidence,
    };
  } else {
    // Without a required list, loose mentions are weak evidence: "meets" needs several matches
    // covering at least half of the skills the posting mentions.
    const hits = matched.length + ownWords.length;
    const coverage = reqs.length ? matched.length / reqs.length : 0;
    const verdict: Verdict = hits >= 3 && coverage >= 0.5 ? 'meets' : hits >= 1 ? 'partial' : 'gap';
    factor = {
      ...base,
      verdict,
      detail: `The posting does not separate required skills. It mentions ${reqs.length} skill${reqs.length === 1 ? '' : 's'} Career Strike recognises; ${hits} of them are yours${matched.length ? ` (${matched.map((r) => r.skill).join(', ')})` : ''}.`,
      evidence,
    };
  }
  return { factor, matchedSkills: matched.map((r) => r.skill), missingRequiredSkills: missingRequired.map((r) => r.skill), transferableSkills: transferable };
}

function experience(job: FitJob, profile: CandidateProfile): FitFactor {
  const base = { id: 'experience' as const, label: 'Experience', hard: false };
  const req = job.requirements.yearsRequired;
  if (!req) return { ...base, verdict: 'unknown', detail: 'The posting does not state a number of years.', evidence: [] };
  const evidence: Evidence[] = [{ source: 'posting', text: `“${req.evidence}”` }];
  if (profile.totalYears === null) return { ...base, verdict: 'unknown', detail: `It asks for ${req.min}+ years. Add your roles to compare.`, evidence };
  evidence.push({ source: 'inferred', text: `About ${profile.totalYears} years from the roles in your profile (overlaps counted once).` });
  const verdict: Verdict = profile.totalYears >= req.min ? 'meets' : profile.totalYears >= req.min - 1 ? 'partial' : 'gap';
  return { ...base, verdict, detail: `It asks for ${req.min}+ years; you have about ${profile.totalYears}.`, evidence };
}

function role(job: FitJob, s: FitSettings, profile: CandidateProfile): FitFactor {
  const base = { id: 'role' as const, label: 'Role direction', hard: false };
  const titleWords = new Set(words(job.title));
  const targets = s.preferredRoles;
  if (targets.length === 0 && profile.roles.length === 0) {
    return { ...base, verdict: 'unknown', detail: 'Add the roles you are targeting to compare this title.', evidence: [] };
  }
  const exact = targets.find((t) => norm(job.title).includes(norm(t)));
  if (exact) return { ...base, verdict: 'meets', detail: `The title matches “${exact}”, a role you are targeting.`, evidence: [{ source: 'settings', text: `Target role: ${exact}` }] };
  const overlap = targets.find((t) => words(t).some((w) => titleWords.has(w)));
  if (overlap) {
    return { ...base, verdict: 'partial', detail: `The title shares words with “${overlap}”, a role you are targeting.`, evidence: [{ source: 'settings', text: `Target role: ${overlap}` }] };
  }
  const past = profile.roles.find((r) => words(r.title).some((w) => titleWords.has(w)));
  if (past) {
    return {
      ...base,
      verdict: 'partial',
      detail: `Not one of your target roles, but related to your past role “${past.title}”.`,
      evidence: [{ source: 'profile', text: `Past role: ${past.title}${past.employer ? ` at ${past.employer}` : ''}` }],
    };
  }
  return {
    ...base,
    verdict: 'gap',
    detail: 'This title is outside your target roles and past titles. It may still suit a career change if your skills match.',
    evidence: targets.length ? [{ source: 'settings', text: `Target roles: ${targets.join(', ')}` }] : [],
  };
}

const PER_YEAR: Record<string, number> = { year: 1, month: 12, week: 52, day: 260, hour: 2080 };

function salary(job: FitJob, s: FitSettings): FitFactor {
  const base = { id: 'salary' as const, label: 'Salary', hard: false };
  if (!job.salary) return { ...base, verdict: 'unknown', detail: 'Not published. Career Strike never estimates salaries.', evidence: [] };
  const pay = job.salary;
  const amount = (n: number | null): string => (n === null ? '?' : n.toLocaleString('en'));
  const evidence: Evidence[] = [{ source: 'posting', text: `${pay.currency} ${amount(pay.min)}–${amount(pay.max)} per ${pay.interval}` }];
  if (!s.salaryExpectation) return { ...base, verdict: 'unknown', detail: 'Add your minimum salary in Settings to compare.', evidence };
  const exp = s.salaryExpectation;
  evidence.push({ source: 'settings', text: `Your minimum: ${exp.currency} ${exp.minimum.toLocaleString('en')} per ${exp.interval}` });
  if (exp.currency !== pay.currency) {
    return { ...base, verdict: 'unknown', detail: `Published in ${pay.currency}; your expectation is in ${exp.currency}. Career Strike does not convert currencies.`, evidence };
  }
  // Annualise only when both sides are periodic salaries; hourly pay is not compared with annual pay.
  if ((pay.interval === 'hour') !== (exp.interval === 'hour')) {
    return { ...base, verdict: 'unknown', detail: 'One amount is hourly and the other is not, so they are not compared.', evidence };
  }
  const top = (pay.max ?? pay.min!) * PER_YEAR[pay.interval]!;
  const bottom = (pay.min ?? pay.max!) * PER_YEAR[pay.interval]!;
  const want = exp.minimum * PER_YEAR[exp.interval]!;
  if (bottom >= want) return { ...base, verdict: 'meets', detail: 'The whole published range is at or above your minimum.', evidence };
  if (top >= want) return { ...base, verdict: 'partial', detail: 'Your minimum falls inside the published range.', evidence };
  return { ...base, verdict: 'gap', detail: 'The top of the published range is below your minimum.', evidence };
}

function start(job: FitJob, s: FitSettings): { factor: FitFactor; asked: boolean; available: boolean | null } {
  const base = { id: 'start' as const, label: 'Start date', hard: false };
  const asked = job.requirements.urgency.length > 0;
  const available = s.joiningAvailability === 'unspecified' ? null : s.joiningAvailability === 'immediate' || s.joiningAvailability === 'two_weeks';
  const evidence: Evidence[] = job.requirements.urgency.map((u) => ({ source: 'posting' as const, text: `“${u}”` }));
  if (s.joiningAvailability !== 'unspecified') evidence.push({ source: 'settings', text: `You can join: ${s.joiningAvailability.replace(/_/g, ' ')}` });
  if (!asked) return { factor: { ...base, verdict: 'unknown', detail: 'The posting does not mention a start date.', evidence }, asked, available };
  if (available === null) return { factor: { ...base, verdict: 'unknown', detail: 'The posting asks for an early start. Set your availability to compare.', evidence }, asked, available };
  return {
    factor: available
      ? { ...base, verdict: 'meets', detail: 'The posting asks for an early start and you can join soon.', evidence }
      : { ...base, verdict: 'gap', detail: 'The posting asks for an early start; your availability is later.', evidence },
    asked,
    available,
  };
}

function freshness(job: FitJob): FitFactor {
  const base = { id: 'freshness' as const, label: 'Still open?', hard: true };
  if (job.status === 'CLOSED') return { ...base, verdict: 'gap', detail: 'The employer has taken this posting down.', evidence: [] };
  if (job.status === 'STALE') return { ...base, verdict: 'unknown', detail: 'Not verified in the last 72 hours; it may have closed.', evidence: [] };
  if (job.status === 'UNVERIFIED') return { ...base, verdict: 'unknown', detail: 'Added by you; Career Strike has not verified it.', evidence: [] };
  return { ...base, verdict: 'meets', detail: 'Verified open within the last 72 hours.', evidence: [] };
}

/**
 * Explain how a posting fits the candidate. The tier is decided by the first rule that applies,
 * in this order, and the rule is returned so the dashboard can show it:
 *   1. ineligible — the posting is closed, the employer is excluded, or it names only countries
 *      the candidate cannot work in;
 *   2. unknown    — the profile has no skills and no roles, so there is nothing to compare;
 *   3. strong     — skills meet the posting and nothing else is a gap;
 *   4. possible   — at most one gap and skills meet or partly meet;
 *   5. stretch    — everything else.
 */
export function evaluateFit(job: FitJob, profile: CandidateProfile, settings: FitSettings): Fit {
  const sk = skillsFactor(job, profile);
  const st = start(job, settings);
  const factors = [
    eligibility(job, settings),
    freshness(job),
    sk.factor,
    experience(job, profile),
    role(job, settings, profile),
    arrangement(job, settings),
    employment(job, settings),
    salary(job, settings),
    st.factor,
  ];
  const excluded = settings.excludedEmployers.some((e) => norm(e) === norm(job.employer));
  const byId = Object.fromEntries(factors.map((f) => [f.id, f])) as Record<FitFactor['id'], FitFactor>;
  const gaps = factors.filter((f) => f.verdict === 'gap');

  let tier: Tier;
  let tierRule: string;
  if (byId.freshness.verdict === 'gap') [tier, tierRule] = ['ineligible', 'The posting has closed.'];
  else if (excluded) [tier, tierRule] = ['ineligible', 'You excluded this employer in Settings.'];
  else if (byId.eligibility.verdict === 'gap') [tier, tierRule] = ['ineligible', 'It names only countries you have not said you can work in.'];
  else if (profile.skills.length === 0 && profile.roles.length === 0) [tier, tierRule] = ['unknown', 'Your profile has no skills or roles yet, so there is nothing to compare.'];
  else if (byId.skills.verdict === 'meets' && gaps.length === 0) [tier, tierRule] = ['strong', 'Your skills meet the posting and nothing else is a gap.'];
  else if (gaps.length <= 1 && (byId.skills.verdict === 'meets' || byId.skills.verdict === 'partial')) {
    const skillsPart =
      byId.skills.verdict === 'meets'
        ? 'Your skills meet the posting'
        : `You have most of the skills it asks for${sk.missingRequiredSkills.length ? ` (missing ${sk.missingRequiredSkills.join(', ')})` : ''}`;
    const rest = gaps.length === 0 ? 'nothing else is a gap' : `one other gap: ${gaps[0]!.label.toLowerCase()}`;
    [tier, tierRule] = ['possible', `${skillsPart}; ${rest}.`];
  }
  else [tier, tierRule] = ['stretch', `${gaps.length} gaps: ${gaps.map((g) => g.label.toLowerCase()).join(', ') || 'skills could not be matched'}.`];

  return {
    tier,
    tierRule,
    factors,
    matchedSkills: sk.matchedSkills,
    missingRequiredSkills: sk.missingRequiredSkills,
    transferableSkills: sk.transferableSkills,
    immediateStart: { asked: st.asked, candidateAvailable: st.available },
  };
}
