import type { TextBlock } from '../sources/types.js';
import { skillsIn } from './skills.js';

/** Bump when extraction rules change; stored requirements with an older version are recomputed. */
export const REQUIREMENTS_VERSION = 2;

export type Importance = 'required' | 'preferred' | 'mentioned';

export interface SkillRequirement {
  skill: string;
  importance: Importance;
  /** The posting sentence the skill was found in, quoted verbatim (trimmed). */
  evidence: string;
}

export interface PostingRequirements {
  version: number;
  skills: SkillRequirement[];
  yearsRequired: { min: number; evidence: string } | null;
  seniority: { level: Seniority; evidence: string } | null;
  /** Quoted text asking for an immediate or urgent start. Never inferred from anything else. */
  urgency: string[];
  /** Quoted text that restricts where a remote employee may live or work. */
  locationConstraints: string[];
}

export type Seniority =
  | 'intern'
  | 'junior'
  | 'mid'
  | 'senior'
  | 'staff'
  | 'principal'
  | 'lead'
  | 'manager'
  | 'director'
  | 'executive';

const REQUIRED_HEADINGS =
  /\b(requirements?|qualifications?|what you('|’)?ll (need|bring)|what we('|’)?re looking for|you (have|bring|are)|must[- ]haves?|minimum|basic qualifications|about you|who you are|skills|experience|thrive|ideal candidate|you should have|you will need|you('|’)?ll need|we('|’)?d love (you|to hear)|you may be a fit|you might be a (good )?fit|is this you)\b/i;
const PREFERRED_HEADINGS =
  /\b(nice[- ]to[- ]haves?|preferred|bonus|pluses?|desirable|good to have|ideally|extra credit)\b/i;
const OTHER_HEADINGS =
  /\b(about (us|the (company|team|role))|what you('|’)?ll do|responsibilities|the role|benefits|perks|what we offer|why join|compensation|equal opportunity|our values)\b/i;

const PREFERRED_INLINE = /\b(nice to have|preferred|is a plus|a bonus|bonus points|ideally|desirable)\b/i;

const URGENCY =
  /\b(immediate(ly)?\s+(start|joiners?|joining|availability|available)|start(ing)?\s+immediately|immediate start|asap|as soon as possible|urgent(ly)?\s+(hiring|need|requirement|opening)|join(ing)? within\s+(1|one|2|two)\s+weeks?|notice period of (0|zero|15) days|immediate joiners?)\b/i;

const LOCATION_CONSTRAINT =
  /\b((remote|work from home)[^.]{0,60}\b(only|based in|located in|within)\b|must (be|reside|live) (based |located )?(in|within)|(eligible|authori[sz]ed) to work in|time ?zones?|(UTC|GMT|CET|EST|PST|IST)\s*[+-±]?\s*\d*|overlap with)\b/i;

const SENIORITY: readonly [RegExp, Seniority][] = [
  [/\b(intern|internship)\b/i, 'intern'],
  [/\b(junior|jr\.?|graduate|entry[- ]level)\b/i, 'junior'],
  [/\b(principal)\b/i, 'principal'],
  [/\b(staff)\b/i, 'staff'],
  [/\b(senior|sr\.?)\b/i, 'senior'],
  [/\b(lead|tech lead)\b/i, 'lead'],
  [/\b(director|head of)\b/i, 'director'],
  [/\b(vp|vice president|chief|cto|ceo|cfo)\b/i, 'executive'],
  [/\b(manager)\b/i, 'manager'],
];

const YEARS = /\b(\d{1,2})\s*(?:\+|plus)?\s*(?:or more\s+)?(?:years|yrs)\b(?:\s+of)?/i;

type Section = 'required' | 'preferred' | 'other' | 'none';

function sectionFor(block: TextBlock, current: Section): Section {
  const isHeadingLike =
    block.type === 'heading' ||
    (block.type === 'paragraph' && block.text.length <= 80 && /[:?]$|^[A-Z][^.!]*$/.test(block.text));
  if (!isHeadingLike) return current;
  if (PREFERRED_HEADINGS.test(block.text)) return 'preferred';
  if (OTHER_HEADINGS.test(block.text)) return 'other';
  if (REQUIRED_HEADINGS.test(block.text)) return 'required';
  return block.type === 'heading' ? 'other' : current;
}

function quote(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > 240 ? `${t.slice(0, 237)}…` : t;
}

const RANK: Record<Importance, number> = { required: 3, preferred: 2, mentioned: 1 };

/**
 * Extract what a posting asks for. Section headings decide whether a skill is required or
 * preferred; anything outside those sections is only "mentioned". Every item keeps its quote,
 * so the dashboard can show exactly where it came from.
 */
export function extractRequirements(title: string, blocks: TextBlock[]): PostingRequirements {
  const skills = new Map<string, SkillRequirement>();
  let section: Section = 'none';
  let years: PostingRequirements['yearsRequired'] = null;
  const urgency: string[] = [];
  const constraints: string[] = [];

  for (const block of blocks) {
    section = sectionFor(block, section);
    const text = block.text;
    let importance: Importance =
      section === 'required' ? 'required' : section === 'preferred' ? 'preferred' : 'mentioned';
    if (importance === 'required' && PREFERRED_INLINE.test(text)) importance = 'preferred';

    for (const skill of skillsIn(text)) {
      const existing = skills.get(skill);
      if (!existing || RANK[importance] > RANK[existing.importance])
        skills.set(skill, { skill, importance, evidence: quote(text) });
    }

    const y = YEARS.exec(text);
    if (y && section !== 'other' && section !== 'preferred' && !PREFERRED_INLINE.test(text)) {
      const min = Number(y[1]);
      if (min > 0 && min <= 30 && (!years || min > years.min)) years = { min, evidence: quote(text) };
    }
    if (URGENCY.test(text) && urgency.length < 3) urgency.push(quote(text));
    if (LOCATION_CONSTRAINT.test(text) && constraints.length < 3) constraints.push(quote(text));
  }

  const seniorityMatch = SENIORITY.find(([re]) => re.test(title));
  return {
    version: REQUIREMENTS_VERSION,
    skills: [...skills.values()].sort(
      (a, b) => RANK[b.importance] - RANK[a.importance] || a.skill.localeCompare(b.skill),
    ),
    yearsRequired: years,
    seniority: seniorityMatch ? { level: seniorityMatch[1], evidence: title } : null,
    urgency,
    locationConstraints: constraints,
  };
}
