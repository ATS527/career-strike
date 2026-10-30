import { describe, expect, it } from 'vitest';
import { nextActions } from '../../src/career/next-actions.js';

const complete = {
  'search.preferredRoles': ['Synthetic Backend Engineer'],
  'candidate.joiningAvailability': 'immediate',
  'candidate.country': 'IN',
  'search.eligibleCountries': [],
};

describe('next best actions', () => {
  it('asks for missing profile basics, each naming its rule', () => {
    const actions = nextActions({
      settings: { 'search.preferredRoles': [], 'candidate.joiningAvailability': 'unspecified', 'candidate.country': null, 'search.eligibleCountries': [] },
    });
    expect(actions.map((a) => a.rule)).toEqual([
      'profile.preferred-roles-missing',
      'profile.availability-missing',
      'profile.eligibility-missing',
    ]);
    for (const a of actions) expect(a.reason.length).toBeGreaterThan(10);
  });

  it('produces nothing when there is nothing real to do', () => {
    expect(nextActions({ settings: complete })).toEqual([]);
  });

  it('is deterministic', () => {
    const state = { settings: { ...complete, 'candidate.joiningAvailability': 'unspecified' } };
    expect(nextActions(state)).toEqual(nextActions(state));
  });
});
