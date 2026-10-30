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

export interface Overview {
  service: { version: string; schemaVersion: number; startedAt: string | null };
  aiHosts: { connected: string[] };
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
}

export interface JobList {
  total: number;
  jobs: JobSummary[];
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
  progress: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  error: string | null;
}

export interface SourceBoard {
  id: string;
  source: 'greenhouse' | 'lever' | 'ashby';
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
