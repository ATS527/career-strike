import type { FitSettings } from '../matching/fit.js';
import type { Db } from '../store/db.js';
import { getSettings } from '../store/settings.js';
import type { CandidateContext } from './jobs.js';
import { approvedProfile } from './profile.js';

export function fitSettingsFrom(settings: Record<string, unknown>): FitSettings {
  return {
    preferredRoles: (settings['search.preferredRoles'] as string[] | undefined) ?? [],
    remotePreference: (settings['search.remotePreference'] as FitSettings['remotePreference'] | undefined) ?? 'remote_only',
    employmentTypes: (settings['search.employmentTypes'] as string[] | undefined) ?? ['full_time'],
    country: (settings['candidate.country'] as string | null | undefined) ?? null,
    eligibleCountries: (settings['search.eligibleCountries'] as string[] | undefined) ?? [],
    joiningAvailability: (settings['candidate.joiningAvailability'] as string | undefined) ?? 'unspecified',
    salaryExpectation: (settings['candidate.salaryExpectation'] as FitSettings['salaryExpectation'] | undefined) ?? null,
    excludedEmployers: (settings['search.excludedEmployers'] as string[] | undefined) ?? [],
  };
}

/** The candidate's approved profile and settings, for matching. SENSITIVE: never leaves the service unscoped. */
export function candidateContext(db: Db): CandidateContext {
  const settings = fitSettingsFrom(getSettings(db));
  return { excludedEmployers: settings.excludedEmployers, profile: approvedProfile(db), settings };
}
