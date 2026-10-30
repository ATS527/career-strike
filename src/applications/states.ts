// The application lifecycle. DISCOVERED, VERIFIED and SHORTLISTED describe the job before an
// application exists (job status and disposition); an application record starts at DRAFTED.

export const APPLICATION_STATES = [
  'DRAFTED',
  'NEEDS_INFORMATION',
  'READY_FOR_REVIEW',
  'APPROVED',
  'NEEDS_MANUAL_ACTION',
  'SUBMISSION_IN_PROGRESS',
  'SUBMITTED_CONFIRMED',
  'SUBMISSION_UNCONFIRMED',
  'SUBMISSION_FAILED',
  'RESPONSE_RECEIVED',
  'INTERVIEW',
  'OFFER',
  'REJECTED',
  'WITHDRAWN',
  'CLOSED',
  'EXPIRED',
  'DUPLICATE',
  'BLOCKED',
  'CANCELLED',
] as const;

export type ApplicationState = (typeof APPLICATION_STATES)[number];

const PRE_SUBMISSION: readonly ApplicationState[] = ['DRAFTED', 'NEEDS_INFORMATION', 'READY_FOR_REVIEW', 'APPROVED', 'BLOCKED'];

const T: Readonly<Record<ApplicationState, readonly ApplicationState[]>> = {
  DRAFTED: ['READY_FOR_REVIEW', 'NEEDS_INFORMATION', 'BLOCKED', 'EXPIRED', 'DUPLICATE', 'CANCELLED'],
  NEEDS_INFORMATION: ['DRAFTED', 'BLOCKED', 'EXPIRED', 'CANCELLED'],
  // Back to DRAFTED = "save for later" or an edit; CANCELLED = rejected at review.
  READY_FOR_REVIEW: ['APPROVED', 'DRAFTED', 'BLOCKED', 'EXPIRED', 'DUPLICATE', 'CANCELLED'],
  // Manual and assisted applications need the candidate to submit on the employer's site.
  APPROVED: ['SUBMISSION_IN_PROGRESS', 'NEEDS_MANUAL_ACTION', 'DRAFTED', 'BLOCKED', 'EXPIRED', 'DUPLICATE', 'CANCELLED'],
  NEEDS_MANUAL_ACTION: ['SUBMITTED_CONFIRMED', 'SUBMISSION_UNCONFIRMED', 'DRAFTED', 'EXPIRED', 'CANCELLED'],
  SUBMISSION_IN_PROGRESS: ['SUBMITTED_CONFIRMED', 'SUBMISSION_UNCONFIRMED', 'SUBMISSION_FAILED'],
  // Unconfirmed never becomes "submitted" without a receipt or the candidate's confirmation.
  SUBMISSION_UNCONFIRMED: ['SUBMITTED_CONFIRMED', 'SUBMISSION_FAILED'],
  // A failed submission needs a fresh draft and a fresh approval; it is never retried as-is.
  SUBMISSION_FAILED: ['DRAFTED', 'CANCELLED'],
  SUBMITTED_CONFIRMED: ['RESPONSE_RECEIVED', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN', 'CLOSED'],
  RESPONSE_RECEIVED: ['INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN', 'CLOSED'],
  INTERVIEW: ['INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN', 'CLOSED'],
  OFFER: ['CLOSED', 'WITHDRAWN', 'REJECTED'],
  BLOCKED: ['DRAFTED', 'CANCELLED'],
  REJECTED: [],
  WITHDRAWN: [],
  CLOSED: [],
  EXPIRED: [],
  DUPLICATE: [],
  CANCELLED: [],
};

export function canTransition(from: ApplicationState, to: ApplicationState): boolean {
  return T[from].includes(to);
}

export function allowedTransitions(from: ApplicationState): readonly ApplicationState[] {
  return T[from];
}

export function isTerminal(state: ApplicationState): boolean {
  return T[state].length === 0;
}

export function isPreSubmission(state: ApplicationState): boolean {
  return PRE_SUBMISSION.includes(state);
}

/** States in which the candidate has really submitted, per a receipt or their own confirmation. */
export function isSubmitted(state: ApplicationState): boolean {
  return ['SUBMITTED_CONFIRMED', 'RESPONSE_RECEIVED', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN', 'CLOSED'].includes(state);
}

export class TransitionError extends Error {
  constructor(
    readonly from: ApplicationState,
    readonly to: ApplicationState,
  ) {
    super(`An application cannot move from ${from} to ${to}.`);
  }
}
