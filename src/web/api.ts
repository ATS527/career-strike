// Browser client for the local Career Strike API. Authentication is the HttpOnly session cookie;
// every non-GET request carries the per-session CSRF token.

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly body: unknown,
  ) {
    super(`${code} (HTTP ${status})`);
  }
}

/** The service could not be reached at all (stopped, restarting, or network failure). */
export class ServiceUnavailableError extends Error {}

type ConnectionListener = (state: 'unavailable' | 'unauthenticated') => void;

let csrfToken: string | null = null;
const listeners = new Set<ConnectionListener>();

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export function currentCsrfToken(): string {
  return csrfToken ?? '';
}

export function onConnectionProblem(listener: ConnectionListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? 'GET';
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET' && csrfToken) headers['x-cs-csrf'] = csrfToken;

  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    listeners.forEach((l) => l('unavailable'));
    throw new ServiceUnavailableError('Career Strike service is not reachable.');
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) listeners.forEach((l) => l('unauthenticated'));
    const code = typeof data === 'object' && data !== null && 'error' in data ? String(data.error) : `HTTP_${res.status}`;
    throw new ApiError(res.status, code, data);
  }
  return data as T;
}

// ---- response shapes ----

export interface NextAction {
  rule: string;
  title: string;
  reason: string;
  href: string;
}

export interface FollowUp {
  id: string;
  applicationId: string;
  dueAt: string;
  note: string;
  status: 'OPEN' | 'DONE' | 'DISMISSED';
  createdAt: string;
  closedAt: string | null;
  title?: string;
  employer?: string;
}

export interface Overview {
  service: { version: string; schemaVersion: number; startedAt: string | null };
  applications: { drafts: number; readyForReview: number; approved: number; awaitingConfirmation: number; submitted: number; interviewing: number; offers: number; expiredUnsent: number };
  followUps: FollowUp[];
  interviews: Interview[];
  aiHosts: { connected: string[]; configured: string[] };
  jobs: JobCounts;
  sources: { boards: number; healthy: number; failing: number; lastSuccessfulDiscovery: string | null };
  activeTasks: Task[];
  nextActions: NextAction[];
}

export interface JsonSchema {
  type?: string;
  enum?: string[];
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  maximum?: number;
  additionalProperties?: JsonSchema | boolean;
}

export interface SettingDefinition {
  key: string;
  label: string;
  help: string;
  options: Record<string, string>;
  classification: 'PUBLIC' | 'PERSONAL' | 'SENSITIVE';
  schema: JsonSchema;
}

export interface SettingsResponse {
  settings: Record<string, unknown>;
  definitions: SettingDefinition[];
}

export interface ValidationIssue {
  message: string;
  path: (string | number)[];
}

export type EffectiveStatus = 'OPEN' | 'STALE' | 'CLOSED' | 'UNVERIFIED';
export type Disposition = 'none' | 'shortlisted' | 'excluded';

export interface PublishedSalary {
  currency: string;
  min: number | null;
  max: number | null;
  interval: 'year' | 'month' | 'week' | 'day' | 'hour';
}

export interface MarketFacts {
  location: { countryCode: string | null; city: string | null; originalText: string | null };
  remoteEligibility: 'global' | 'country_restricted' | 'region_restricted' | 'unknown' | 'not_remote';
  remoteEligibleCountries: string[];
  visaSponsorship: 'yes' | 'no' | 'unknown';
  workAuthorization: 'required' | 'not_required' | 'unknown';
  relocationAssistance: 'yes' | 'no' | 'unknown';
}

export interface JobSummary {
  id: string;
  employer: string;
  title: string;
  locationText: string | null;
  remotePolicy: 'remote' | 'hybrid' | 'onsite' | 'unknown';
  employmentType: string;
  salary: PublishedSalary | null;
  status: EffectiveStatus;
  firstSeenAt: string;
  lastVerifiedAt: string | null;
  publishedAt: string | null;
  sources: string[];
  duplicateOf: string | null;
  disposition: Disposition;
  employerExcluded: boolean;
  market: MarketFacts;
  sourceCapabilities: string[];
  fit?: FitSummary;
}

export interface TextBlock {
  type: 'heading' | 'paragraph' | 'item';
  text: string;
}

export interface JobDetail extends JobSummary {
  department: string | null;
  description: TextBlock[];
  applyUrl: string | null;
  postingUrl: string | null;
  closedAt: string | null;
  unresolved: string[];
  sourceRecords: { source: string; board: string; sourceJobId: string; url: string | null; fetchedAt: string }[];
  duplicates: { id: string; title: string; employer: string; sources: string[] }[];
  requirements: PostingRequirements;
  fitDetail?: FitDetail;
}

export interface JobList {
  total: number;
  jobs: JobSummary[];
  fitAvailable: boolean;
}

export interface Task {
  id: string;
  kind: string;
  trigger: string;
  client: string;
  state: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'INTERRUPTED';
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  heartbeatAt: string | null;
  attempt: number;
  live: boolean;
  progress: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  error: string | null;
}

export interface SourceBoard {
  id: string;
  source: 'greenhouse' | 'lever' | 'ashby' | 'practice';
  board: string;
  boardUrl: string;
  addedAt: string;
  health: 'NEVER_RUN' | 'OK' | 'DEGRADED' | 'NOT_FOUND';
  lastSuccessAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  lastTask: { id: string; state: Task['state']; endedAt: string | null } | null;
}

export interface JobCounts {
  open: number;
  stale: number;
  unverified: number;
  shortlisted: number;
  unreviewed: number;
  newSince24h: number;
}

export type Tier = 'strong' | 'possible' | 'stretch' | 'ineligible' | 'unknown';
export type Verdict = 'meets' | 'partial' | 'gap' | 'unknown';

export interface FitSummary {
  tier: Tier;
  tierRule: string;
  matchedSkills: string[];
  missingRequiredSkills: string[];
  immediateStartAsked: boolean;
}

export interface FitFactor {
  id: string;
  label: string;
  verdict: Verdict;
  detail: string;
  evidence: { source: 'posting' | 'profile' | 'settings' | 'inferred'; text: string }[];
  hard: boolean;
}

export interface FitDetail {
  tier: Tier;
  tierRule: string;
  factors: FitFactor[];
  matchedSkills: string[];
  missingRequiredSkills: string[];
  transferableSkills: string[];
  immediateStart: { asked: boolean; candidateAvailable: boolean | null };
}

export interface PostingRequirements {
  skills: { skill: string; importance: 'required' | 'preferred' | 'mentioned'; evidence: string }[];
  yearsRequired: { min: number; evidence: string } | null;
  seniority: { level: string; evidence: string } | null;
  urgency: string[];
  locationConstraints: string[];
}

export type FactKind = 'skill' | 'role' | 'education' | 'certification' | 'language';

export interface ProfileFact {
  id: string;
  kind: FactKind;
  value: Record<string, unknown>;
  source: 'user' | 'document';
  approved: boolean;
  createdAt: string;
}

export interface StoredDocument {
  id: string;
  kind: 'resume' | 'cover_letter' | 'other';
  filename: string;
  mime: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
}

export type ApplicationState =
  | 'DRAFTED' | 'NEEDS_INFORMATION' | 'READY_FOR_REVIEW' | 'APPROVED' | 'NEEDS_MANUAL_ACTION' | 'SUBMISSION_IN_PROGRESS'
  | 'SUBMITTED_CONFIRMED' | 'SUBMISSION_UNCONFIRMED' | 'SUBMISSION_FAILED' | 'RESPONSE_RECEIVED' | 'INTERVIEW' | 'OFFER'
  | 'REJECTED' | 'WITHDRAWN' | 'CLOSED' | 'EXPIRED' | 'DUPLICATE' | 'BLOCKED' | 'CANCELLED';

export interface PayloadField {
  key: string;
  label: string;
  required: boolean;
  kind: 'text' | 'long_text' | 'file' | 'choice';
  options: string[];
  source: 'identity' | 'document' | 'draft' | 'candidate' | 'empty';
  value: string | null;
}

export interface ApplicationPayload {
  job: { id: string; canonicalKey: string; employer: string; title: string };
  destination: { method: 'manual' | 'assisted' | 'test-ats'; url: string | null };
  identity: { fullName: string | null; email: string | null; phone: string | null; links: string[] };
  fields: PayloadField[];
  coverLetter: string | null;
  personalization?: {
    profileFingerprint: string;
    snapshotId: string;
    variants: { id: string; kind: 'resume' | 'cover_letter'; contentHash: string }[];
  } | null;
  attachments: { documentId: string; kind: string; filename: string; sha256: string }[];
  notAnswered: string[];
}

export interface ProfileEvidence {
  id: string;
  kind: 'project' | 'achievement' | 'portfolio' | 'employment_detail';
  value: Record<string, unknown>;
  source: 'user' | 'document';
  confirmed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PersonalizationVariant {
  id: string;
  kind: 'resume' | 'cover_letter';
  format: 'source_text';
  locale: string;
  content: string;
  contentHash: string;
  profileFingerprint: string;
  status: 'DRAFT' | 'CANDIDATE_EDITED' | 'APPROVED' | 'SUPERSEDED';
  basedOnVariantId: string | null;
  createdAt: string;
  evidence: { requirement: string; classification: string; evidenceRefs: string[]; explanation: string }[];
}

export interface PersonalizationView {
  applicationId: string;
  snapshot: { id: string; completeness: 'FULL' | 'INCOMPLETE' | 'MISSING'; createdAt: string } | null;
  variants: PersonalizationVariant[];
  requirements: { requirement: string; classification: string; evidenceRefs: string[]; explanation: string }[];
  stale: boolean;
  warnings: string[];
}

export interface ApplicationView {
  id: string;
  jobId: string;
  state: ApplicationState;
  mode: string;
  version: number;
  payload: ApplicationPayload;
  payloadHash: string;
  createdAt: string;
  updatedAt: string;
  job: { title: string; employer: string; status: string };
  versions: { version: number; createdBy: string; reason: string; createdAt: string; payloadHash: string }[];
  events: { from: string | null; to: string; actor: string; note: string | null; evidence: Record<string, unknown> | null; at: string }[];
  followUps: FollowUp[];
  duplicateRisk: { applicationId: string; state: ApplicationState; source: string }[];
  approval: { valid: boolean; reason: string; approval: { id: string; state: string; version: number; issuedAt: string; expiresAt: string; stateReason: string | null } | null };
  warnings: { kind: string; message: string }[];
  missingRequired: string[];
  disclosures: string[];
  allowedTransitions: ApplicationState[];
}

export interface ApplicationSummary {
  id: string;
  jobId: string;
  state: ApplicationState;
  title: string;
  employer: string;
  version: number;
  updatedAt: string;
}

export interface Interview {
  id: string;
  applicationId: string;
  stage: string;
  format: string;
  scheduledAt: string;
  notes: string | null;
  outcome: 'pending' | 'passed' | 'not_passed' | 'cancelled';
  title?: string;
  employer?: string;
}

export interface PrepTopic {
  id: string;
  title: string;
  kind: string;
  source: 'posting' | 'inferred';
  quote: string | null;
  gap: boolean;
  prompts: string[];
  sessions: number;
  lastConfidence: number | null;
  lastPracticedAt: string | null;
}

export interface Prep {
  application: { id: string; state: ApplicationState; title: string; employer: string };
  topics: PrepTopic[];
  sessions: { id: string; topicId: string; notes: string | null; confidence: number; minutes: number | null; practicedAt: string }[];
  interviews: Interview[];
}
