import type { Db } from '../store/db.js';
import { listFacts } from './profile.js';
import { listEvidence } from './evidence.js';

export type ProfileReadinessState =
  | 'PROFILE_MISSING_INFORMATION'
  | 'PROFILE_EXTRACTED_UNCONFIRMED'
  | 'PROFILE_READY_FOR_MATCHING'
  | 'APPLICATION_INFORMATION_INCOMPLETE'
  | 'PROFILE_READY_FOR_APPLICATION_PREPARATION';

export interface ProfileReadinessCounts {
  confirmedRoles: number;
  unconfirmedRoles: number;
  confirmedSkills: number;
  unconfirmedSkills: number;
  confirmedEducation: number;
  confirmedCertifications: number;
  confirmedLanguages: number;
  confirmedEvidence: number;
  unconfirmedEvidence: number;
  totalUnconfirmed: number;
}

export interface ProfileReadinessReport {
  state: ProfileReadinessState;
  title: string;
  summary: string;
  actionLabel: string;
  actionHref: string;
  counts: ProfileReadinessCounts;
  hasContactDetails: boolean;
  hasLinkedInUrl: boolean;
  missingRequirements: string[];
  recommendations: string[];
}

export function evaluateProfileReadiness(db: Db): ProfileReadinessReport {
  const allFacts = listFacts(db, { approvedOnly: false });
  const allEvidence = listEvidence(db, { confirmedOnly: false });

  const settingsRows = db
    .prepare('SELECT key, value_json FROM settings')
    .all() as { key: string; value_json: string }[];
  const settings = Object.fromEntries(
    settingsRows.map((r) => {
      try {
        return [r.key, JSON.parse(r.value_json)];
      } catch {
        return [r.key, null];
      }
    }),
  );

  const confirmedRoles = allFacts.filter((f) => f.kind === 'role' && f.approved).length;
  const unconfirmedRoles = allFacts.filter((f) => f.kind === 'role' && !f.approved).length;
  const confirmedSkills = allFacts.filter((f) => f.kind === 'skill' && f.approved).length;
  const unconfirmedSkills = allFacts.filter((f) => f.kind === 'skill' && !f.approved).length;
  const confirmedEducation = allFacts.filter((f) => f.kind === 'education' && f.approved).length;
  const confirmedCertifications = allFacts.filter((f) => f.kind === 'certification' && f.approved).length;
  const confirmedLanguages = allFacts.filter((f) => f.kind === 'language' && f.approved).length;
  const confirmedEvidence = allEvidence.filter((e) => e.confirmed).length;
  const unconfirmedEvidence = allEvidence.filter((e) => !e.confirmed).length;

  const totalUnconfirmed =
    allFacts.filter((f) => !f.approved).length + unconfirmedEvidence;

  const hasName = typeof settings['identity.fullName'] === 'string' && settings['identity.fullName'].trim().length > 0;
  const hasEmail = typeof settings['identity.email'] === 'string' && settings['identity.email'].trim().length > 0;
  const hasContactDetails = hasName && hasEmail;
  const hasLinkedInUrl = typeof settings['candidate.linkedinUrl'] === 'string' && settings['candidate.linkedinUrl'].trim().length > 0;
  const hasPreferredRoles = Array.isArray(settings['search.preferredRoles']) && settings['search.preferredRoles'].length > 0;

  const counts: ProfileReadinessCounts = {
    confirmedRoles,
    unconfirmedRoles,
    confirmedSkills,
    unconfirmedSkills,
    confirmedEducation,
    confirmedCertifications,
    confirmedLanguages,
    confirmedEvidence,
    unconfirmedEvidence,
    totalUnconfirmed,
  };

  const missingRequirements: string[] = [];
  const recommendations: string[] = [];

  if (confirmedRoles === 0) {
    missingRequirements.push('At least one confirmed past role');
  }
  if (confirmedSkills === 0) {
    missingRequirements.push('At least one confirmed skill');
  }
  if (!hasContactDetails) {
    if (!hasName) missingRequirements.push('Full name for applications');
    if (!hasEmail) missingRequirements.push('Email address for applications');
  }

  if (!hasLinkedInUrl) {
    recommendations.push('Add your LinkedIn profile link to pre-fill application questions');
  }
  if (!hasPreferredRoles) {
    recommendations.push('Save preferred job roles in Settings to refine ranking');
  }
  if (confirmedEvidence === 0) {
    recommendations.push('Add verified project evidence or achievements to strengthen tailored resumes');
  }

  // 1. Missing core information (0 roles or 0 skills confirmed)
  if (confirmedRoles === 0 || confirmedSkills === 0) {
    if (totalUnconfirmed > 0) {
      return {
        state: 'PROFILE_EXTRACTED_UNCONFIRMED',
        title: 'Extracted Facts Awaiting Confirmation',
        summary: `You have ${totalUnconfirmed} extracted fact${totalUnconfirmed === 1 ? '' : 's'} awaiting your review. Career Strike never uses unconfirmed facts in job matching, tailored resumes, or AI disclosures.`,
        actionLabel: 'Review and Confirm Facts',
        actionHref: '/profile',
        counts,
        hasContactDetails,
        hasLinkedInUrl,
        missingRequirements,
        recommendations,
      };
    }

    return {
      state: 'PROFILE_MISSING_INFORMATION',
      title: 'Profile Needs Experience & Skills',
      summary: 'Add your past roles and skills so Career Strike can match verified opportunities against your background.',
      actionLabel: 'Build Your Profile',
      actionHref: '/profile',
      counts,
      hasContactDetails,
      hasLinkedInUrl,
      missingRequirements,
      recommendations,
    };
  }

  // 2. Core matching criteria met (>= 1 role and >= 1 skill confirmed)
  // Check if contact info is present for application preparation
  if (!hasContactDetails) {
    return {
      state: 'APPLICATION_INFORMATION_INCOMPLETE',
      title: 'Ready for Job Matching · Contact Details Needed to Apply',
      summary: 'Your background is verified for job matching. Add your contact name and email before generating tailored applications.',
      actionLabel: 'Add Contact Details',
      actionHref: '/settings#identity.fullName',
      counts,
      hasContactDetails,
      hasLinkedInUrl,
      missingRequirements,
      recommendations,
    };
  }

  // If there are unconfirmed items but core profile and contact details are met
  if (totalUnconfirmed > 0) {
    recommendations.unshift(`You have ${totalUnconfirmed} unconfirmed item${totalUnconfirmed === 1 ? '' : 's'} you can review in your profile`);
  }

  return {
    state: 'PROFILE_READY_FOR_APPLICATION_PREPARATION',
    title: 'Profile Ready for Applications',
    summary: 'Your verified background and contact details are ready to prepare, tailor, and approve job applications.',
    actionLabel: 'Find Matching Jobs',
    actionHref: '/opportunities?sort=best_fit',
    counts,
    hasContactDetails,
    hasLinkedInUrl,
    missingRequirements: [],
    recommendations,
  };
}
