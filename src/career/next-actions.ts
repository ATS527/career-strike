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
  matches?: { strongUnreviewed: number; immediateStartUnreviewed: number; profileFacts: number };
  availability?: string;
  applications?: { drafts: number; readyForReview: number; approved: number; awaitingConfirmation: number; interviewing: number; offers: number };
  followUpsDue?: { id: string; note: string; title: string; employer: string; applicationId: string }[];
}

type Rule = (state: CareerState) => NextAction | NextAction[] | null;

const isEmptyList = (v: unknown): boolean => !Array.isArray(v) || v.length === 0;
const plural = (n: number, word: string, many = `${word}s`): string => `${n} ${n === 1 ? word : many}`;

const RULES: readonly Rule[] = [
  ({ followUpsDue }) =>
    (followUpsDue ?? []).map((f) => ({
      rule: 'follow-ups.due',
      title: `Follow up: ${f.note}`,
      reason: `You set this reminder for your ${f.title} application at ${f.employer}, and it is due.`,
      href: `/applications/${f.applicationId}`,
    })),
  ({ applications }) =>
    applications && applications.awaitingConfirmation > 0
      ? {
          rule: 'applications.confirm-submission',
          title: `Confirm whether ${plural(applications.awaitingConfirmation, 'application was', 'applications were')} sent`,
          reason: 'You started submitting these on the employer’s site. Career Strike only counts them as submitted once you confirm.',
          href: '/applications',
        }
      : null,
  ({ applications }) =>
    applications && applications.readyForReview > 0
      ? {
          rule: 'applications.ready-for-review',
          title: `Review ${plural(applications.readyForReview, 'prepared application')}`,
          reason: 'They are ready for your review. Nothing is sent until you approve the exact version.',
          href: '/applications',
        }
      : null,
  ({ applications }) =>
    applications && applications.approved > 0
      ? {
          rule: 'applications.approved-unsent',
          title: `Submit ${plural(applications.approved, 'approved application')}`,
          reason: 'You approved these, but they have not been submitted on the employer’s site yet. Approvals expire after 7 days.',
          href: '/applications',
        }
      : null,
  ({ boards }) =>
    (boards ?? [])
      .filter((b) => b.health === 'DEGRADED' || b.health === 'NOT_FOUND')
      .map((b) => ({
        rule: 'sources.board-failing',
        title: `Check the ${b.source} board “${b.board}”`,
        reason: b.health === 'NOT_FOUND' ? 'The board does not exist on this source. The name may be misspelled.' : `The last fetch failed: ${b.lastError ?? 'unknown error'}.`,
        href: '/opportunities/sources',
      })),
  ({ matches }) =>
    matches && matches.strongUnreviewed > 0
      ? {
          rule: 'matches.strong-unreviewed',
          title: `Look at ${plural(matches.strongUnreviewed, 'strong match', 'strong matches')} first`,
          reason: 'Your listed skills meet these verified-open postings and nothing else in your settings rules them out.',
          href: '/opportunities?status=OPEN&disposition=none&tier=strong&sort=best_fit',
        }
      : null,
  ({ matches, availability }) =>
    matches && matches.immediateStartUnreviewed > 0 && (availability === 'immediate' || availability === 'two_weeks')
      ? {
          rule: 'matches.immediate-start',
          title: `${plural(matches.immediateStartUnreviewed, 'role')} ${matches.immediateStartUnreviewed === 1 ? 'asks' : 'ask'} for an early start`,
          reason: 'The posting text asks for an immediate or early start, and you said you can join soon.',
          href: '/opportunities?status=OPEN&disposition=none&immediateStart=true&sort=best_fit',
        }
      : null,
  ({ matches }) =>
    matches && matches.profileFacts === 0
      ? {
          rule: 'profile.skills-missing',
          title: 'Add your skills and past roles',
          reason: 'Career Strike compares postings with your profile. Without skills or roles, it cannot say how well a role fits.',
          href: '/profile',
        }
      : null,
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
