import type { Fit } from '../matching/fit.js';
import type { PostingRequirements } from '../matching/requirements.js';

export interface PrepTopic {
  id: string;
  title: string;
  kind: 'skill' | 'experience' | 'system_design' | 'coding' | 'behavioral' | 'company';
  /** 'posting' = the employer asked for it (quote attached); 'inferred' = Career Strike's suggestion. */
  source: 'posting' | 'inferred';
  quote: string | null;
  /** A required skill the candidate's profile does not list. */
  gap: boolean;
  prompts: string[];
}

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const ENGINEERING = /\b(engineer|developer|architect|sre|devops|programmer|scientist|ml|data)\b/i;
const SENIOR = new Set(['senior', 'staff', 'principal', 'lead', 'director', 'executive', 'manager']);

/**
 * Preparation topics for one application. Everything the employer asked for comes first, with
 * the posting's own words; general categories are labelled as Career Strike's suggestions.
 */
export function prepTopics(input: {
  title: string;
  employer: string;
  requirements: PostingRequirements;
  fit: Fit | null;
}): PrepTopic[] {
  const { title, employer, requirements, fit } = input;
  const missing = new Set((fit?.missingRequiredSkills ?? []).map((s) => s.toLowerCase()));
  const topics: PrepTopic[] = [];

  for (const r of requirements.skills.filter((s) => s.importance !== 'mentioned')) {
    const gap = missing.has(r.skill.toLowerCase());
    topics.push({
      id: `skill-${slug(r.skill)}`,
      title: r.skill,
      kind: 'skill',
      source: 'posting',
      quote: r.evidence,
      gap,
      prompts: gap
        ? [
            `The posting lists ${r.skill} as ${r.importance}. Be ready to say honestly what you know and how you would close the gap.`,
            `Learn the core concepts of ${r.skill} well enough to discuss trade-offs.`,
            `Find a related skill you do have and prepare a short example that transfers.`,
          ]
        : [
            `Describe a recent piece of work where you used ${r.skill}: the problem, your part, the result.`,
            `What trade-offs or pitfalls of ${r.skill} have you run into, and how did you handle them?`,
            `How would you explain ${r.skill} to a teammate who has not used it?`,
          ],
    });
  }

  if (requirements.yearsRequired) {
    topics.push({
      id: 'experience-depth',
      title: `${requirements.yearsRequired.min}+ years of relevant experience`,
      kind: 'experience',
      source: 'posting',
      quote: requirements.yearsRequired.evidence,
      gap: fit?.factors.find((f) => f.id === 'experience')?.verdict === 'gap',
      prompts: [
        'Walk through your career so far in two minutes, ending with why this role is the next step.',
        'Pick the project that best shows the depth this role needs and rehearse it.',
      ],
    });
  }

  if (ENGINEERING.test(title)) {
    topics.push({
      id: 'coding',
      title: 'Coding exercise',
      kind: 'coding',
      source: 'inferred',
      quote: null,
      gap: false,
      prompts: [
        'Practise thinking aloud while solving a medium-sized problem in your strongest language.',
        'Review testing a function you have just written, including edge cases.',
      ],
    });
    if (requirements.seniority && SENIOR.has(requirements.seniority.level)) {
      topics.push({
        id: 'system-design',
        title: 'System design',
        kind: 'system_design',
        source: 'inferred',
        quote: null,
        gap: false,
        prompts: [
          'Design a service you know well from scratch: requirements, data model, scaling, failure handling.',
          'Prepare to discuss a design decision you would make differently now, and why.',
        ],
      });
    }
  }

  topics.push({
    id: 'behavioral',
    title: 'Behavioural questions',
    kind: 'behavioral',
    source: 'inferred',
    quote: null,
    gap: false,
    prompts: [
      'A time you disagreed with a decision: what you did and what happened (situation, task, action, result).',
      'A failure or mistake and what you changed afterwards.',
      'The piece of work you are proudest of and its measurable impact.',
      'A time you had to deliver with unclear requirements.',
    ],
  });
  topics.push({
    id: 'company',
    title: `Why ${employer}`,
    kind: 'company',
    source: 'inferred',
    quote: null,
    gap: false,
    prompts: [
      `Read ${employer}’s posting again and note what they build and for whom.`,
      `Prepare two questions to ask them about the team and the first 90 days.`,
    ],
  });
  return topics;
}
