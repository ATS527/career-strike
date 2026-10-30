// Next Best Action rules. Each action is derived from stored state by a named rule so the
// dashboard can always explain why it is shown. No rule may invent urgency or progress.

export interface NextAction {
  rule: string;
  title: string;
  reason: string;
  href: string;
}

export interface CareerState {
  settings: Record<string, unknown>;
  jobs?: { open: number; unverified: number; unreviewed: number; shortlisted: number };
  boards?: { source: string; board: string; health: string; lastError: string | null }[];
}

type Rule = (state: CareerState) => NextAction | NextAction[] | null;

const isEmptyList = (v: unknown): boolean => !Array.isArray(v) || v.length === 0;
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

const RULES: readonly Rule[] = [
  ({ boards }) =>
    (boards ?? [])
      .filter((b) => b.health === 'DEGRADED' || b.health === 'NOT_FOUND')
      .map((b) => ({
        rule: 'sources.board-failing',
        title: `Check the ${b.source} board “${b.board}”`,
        reason: b.health === 'NOT_FOUND' ? 'The board does not exist on this source. The name may be misspelled.' : `The last fetch failed: ${b.lastError ?? 'unknown error'}.`,
        href: '/opportunities/sources',
      })),
  ({ jobs }) =>
    jobs && jobs.unreviewed > 0
      ? {
          rule: 'jobs.unreviewed',
          title: `Review ${plural(jobs.unreviewed, 'verified open role')}`,
          reason: 'These postings were verified open within the last 72 hours and you have not shortlisted or excluded them yet.',
          href: '/opportunities?disposition=none&status=OPEN',
        }
      : null,
  ({ settings }) =>
    isEmptyList(settings['search.preferredRoles'])
      ? {
          rule: 'profile.preferred-roles-missing',
          title: 'Add the roles you are targeting',
          reason: 'No preferred roles are saved, so opportunities cannot be prioritised for you.',
          href: '/settings#search.preferredRoles',
        }
      : null,
  ({ settings }) =>
    settings['candidate.joiningAvailability'] === 'unspecified'
      ? {
          rule: 'profile.availability-missing',
          title: 'Set your joining availability',
          reason: 'Availability is unspecified, so roles that need an immediate joiner cannot be highlighted.',
          href: '/settings#candidate.joiningAvailability',
        }
      : null,
  ({ settings }) =>
    settings['candidate.country'] == null && isEmptyList(settings['search.eligibleCountries'])
      ? {
          rule: 'profile.eligibility-missing',
          title: 'Tell Career Strike where you can work',
          reason: 'Neither a country of residence nor work-eligible countries are saved, so location eligibility is unknown.',
          href: '/settings#search.eligibleCountries',
        }
      : null,
  ({ jobs, boards }) =>
    jobs && boards && boards.length === 0 && jobs.open + jobs.unverified === 0
      ? {
          rule: 'jobs.no-sources',
          title: 'Add a job board to monitor, or add a job by hand',
          reason: 'Career Strike has no opportunities yet because no job board is monitored and no job was entered.',
          href: '/opportunities/sources',
        }
      : null,
];

export function nextActions(state: CareerState): NextAction[] {
  return RULES.flatMap((rule) => {
    const out = rule(state);
    return out === null ? [] : Array.isArray(out) ? out : [out];
  });
}
