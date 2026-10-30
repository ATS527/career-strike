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
