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
}

type Rule = (state: CareerState) => NextAction | null;

const isEmptyList = (v: unknown): boolean => !Array.isArray(v) || v.length === 0;

const RULES: readonly Rule[] = [
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
];

export function nextActions(state: CareerState): NextAction[] {
  return RULES.map((rule) => rule(state)).filter((a): a is NextAction => a !== null);
}
