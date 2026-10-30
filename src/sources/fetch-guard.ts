import { SourceError } from './types.js';

// Career Strike only ever contacts these hosts on its own. Each is a documented public job-board API.
export const ALLOWED_HOSTS: ReadonlySet<string> = new Set(['boards-api.greenhouse.io', 'api.lever.co', 'api.ashbyhq.com']);

const MAX_BYTES = 20 * 1024 * 1024;
const TIMEOUT_MS = 20_000;
const MIN_INTERVAL_MS = 1_000;
const USER_AGENT = 'CareerStrike/0.1 (local job-search assistant)';

const lastRequestAt = new Map<string, number>();

export type FetchImpl = (url: string, init: RequestInit) => Promise<Response>;

export interface GuardOptions {
  fetchImpl?: FetchImpl;
  signal?: AbortSignal;
  /** Overridable for tests; production uses ALLOWED_HOSTS. */
  allowedHosts?: ReadonlySet<string>;
  minIntervalMs?: number;
  timeoutMs?: number;
}

export class BlockedUrlError extends SourceError {
  constructor(message: string) {
    super('blocked', message);
  }
}

/** Throws unless the URL is HTTPS on an allowlisted host with no credentials or odd ports. */
export function assertAllowedUrl(raw: string, allowedHosts: ReadonlySet<string> = ALLOWED_HOSTS): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedUrlError('Not a valid URL');
  }
  if (url.protocol !== 'https:') throw new BlockedUrlError(`Only https is allowed (got ${url.protocol})`);
  if (url.username || url.password) throw new BlockedUrlError('URLs with credentials are not allowed');
  if (url.port && url.port !== '443') throw new BlockedUrlError('Non-standard ports are not allowed');
  if (!allowedHosts.has(url.hostname)) throw new BlockedUrlError(`Host ${url.hostname} is not an allowed job source`);
  return url;
}

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });

/**
 * GET JSON from an allowlisted job-board API. Redirects are not followed (a redirect off the
 * allowlist would be an SSRF vector); responses are size-limited and requests are rate-limited
 * per host so Career Strike stays a polite client.
 */
export async function guardedGetJson(raw: string, opts: GuardOptions = {}): Promise<unknown> {
  const url = assertAllowedUrl(raw, opts.allowedHosts);
  const fetchImpl = opts.fetchImpl ?? ((u, i) => fetch(u, i));

  const minInterval = opts.minIntervalMs ?? MIN_INTERVAL_MS;
  const wait = (lastRequestAt.get(url.host) ?? 0) + minInterval - Date.now();
  if (wait > 0) await sleep(wait, opts.signal);
  lastRequestAt.set(url.host, Date.now());

  const timeout = AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
  let res: Response;
  try {
    res = await fetchImpl(url.href, { method: 'GET', redirect: 'manual', signal, headers: { accept: 'application/json', 'user-agent': USER_AGENT } });
  } catch (err) {
    if (opts.signal?.aborted) throw err;
    throw new SourceError('outage', `Could not reach ${url.hostname}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (res.status >= 300 && res.status < 400) throw new BlockedUrlError(`Refusing to follow a redirect from ${url.hostname}`);
  if (res.status === 404) throw new SourceError('not_found', `${url.hostname} reports that this board does not exist`);
  if (res.status === 429 || res.status === 503) {
    const retryAfter = retryAfterMs(res.headers.get('retry-after'));
    if (res.status === 429 || retryAfter !== null) {
      const until = retryAfter === null ? '' : ` for ${Math.ceil(retryAfter / 60_000)} min`;
      throw new SourceError('rate_limited', `${url.hostname} asked Career Strike to slow down${until} (HTTP ${res.status})`, retryAfter);
    }
  }
  if (!res.ok) throw new SourceError('outage', `${url.hostname} returned HTTP ${res.status}`);

  const declared = Number(res.headers.get('content-length') ?? '0');
  if (declared > MAX_BYTES) throw new SourceError('schema', 'Response is too large');
  const body = await readLimited(res, MAX_BYTES);
  try {
    return JSON.parse(body);
  } catch {
    throw new SourceError('schema', `${url.hostname} did not return JSON`);
  }
}

async function readLimited(res: Response, limit: number): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new SourceError('schema', 'Response is too large');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Retry-After as delay-seconds or an HTTP date, capped at a day; null if absent or unreadable. */
export function retryAfterMs(header: string | null, now = Date.now()): number | null {
  if (!header) return null;
  const seconds = /^\d+$/.test(header.trim()) ? Number(header.trim()) * 1000 : Date.parse(header) - now;
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.min(seconds, 24 * 3600_000);
}
