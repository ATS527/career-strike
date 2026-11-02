import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { VERSION } from '../core/version.js';
import { compareVersions, parseVersion } from './version.js';

// Releases are published on GitHub by .github/workflows/release.yml: a tarball built by
// `npm pack`, a SHA-256 checksum file and a build-provenance attestation. The repository they
// come from is recorded in the build (dist/release.json, written by scripts/stamp-release.ts).
const RELEASE_FILE = new URL('../../dist/release.json', import.meta.url);

/** "owner/name" of the GitHub repository this build's releases come from, if recorded. */
export function releaseRepository(opts: ReleaseSourceOptions = {}): string | null {
  if (opts.repository !== undefined) return opts.repository;
  try {
    const { repository } = JSON.parse(fs.readFileSync(RELEASE_FILE, 'utf8')) as { repository?: unknown };
    return typeof repository === 'string' && /^[\w.-]+\/[\w.-]+$/.test(repository) ? repository : null;
  } catch {
    return null;
  }
}

// Career Strike contacts these hosts for updates, and only when the candidate asks (or has turned
// on update checks). Release downloads redirect from github.com to GitHub's file hosts.
const UPDATE_HOSTS: ReadonlySet<string> = new Set([
  'api.github.com',
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
]);

const MAX_JSON_BYTES = 5 * 1024 * 1024;
const MAX_PACKAGE_BYTES = 100 * 1024 * 1024;
const TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 5;

export class UpdateError extends Error {}

export interface Release {
  version: string;
  tag: string;
  name: string;
  notes: string;
  url: string;
  publishedAt: string | null;
  packageUrl: string;
  checksumUrl: string;
}

export type FetchImpl = (url: string, init: RequestInit) => Promise<Response>;

export interface ReleaseSourceOptions {
  /** Test seams; production uses the recorded repository, or CAREER_STRIKE_RELEASES_URL. */
  repository?: string | null;
  releasesUrl?: string;
  fetchImpl?: FetchImpl;
}

const ReleaseJson = z.object({
  tag_name: z.string(),
  name: z.string().nullable().optional(),
  body: z.string().nullable().optional(),
  html_url: z.string(),
  draft: z.boolean().optional(),
  prerelease: z.boolean().optional(),
  published_at: z.string().nullable().optional(),
  assets: z.array(z.object({ name: z.string(), browser_download_url: z.string() })),
});

/** True when releases come from somewhere other than GitHub (a rehearsal or test server). */
export function releaseSourceOverridden(opts: ReleaseSourceOptions = {}): boolean {
  return opts.releasesUrl !== undefined || process.env.CAREER_STRIKE_RELEASES_URL !== undefined;
}

function releasesUrl(opts: ReleaseSourceOptions): string {
  const override = opts.releasesUrl ?? process.env.CAREER_STRIKE_RELEASES_URL;
  if (override) return override;
  const repository = releaseRepository(opts);
  if (!repository) throw new UpdateError('This copy of Career Strike does not record where its releases are published (it was not built from a GitHub checkout). Install a release package to get updates.');
  return `https://api.github.com/repos/${repository}/releases`;
}

/** A test release server on loopback is allowed only when the source was overridden. */
function checkUrl(raw: string, overridden: boolean): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UpdateError(`Not a valid update URL: ${raw}`);
  }
  const loopback = url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
  if (overridden && loopback) return url;
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !UPDATE_HOSTS.has(url.hostname)) {
    throw new UpdateError(`Refusing to contact ${url.host} for updates.`);
  }
  return url;
}

/** GET with redirects followed only while they stay on the update hosts. */
async function get(raw: string, accept: string, opts: ReleaseSourceOptions): Promise<Response> {
  const overridden = releaseSourceOverridden(opts);
  const fetchImpl = opts.fetchImpl ?? ((u, i) => fetch(u, i));
  let url = checkUrl(raw, overridden);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res: Response;
    try {
      res = await fetchImpl(url.href, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { accept, 'user-agent': `CareerStrike/${VERSION} (update check)` },
      });
    } catch (err) {
      throw new UpdateError(`Could not reach ${url.hostname}: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) throw new UpdateError(`${url.hostname} redirected without a location.`);
      url = checkUrl(new URL(location, url).href, overridden);
      continue;
    }
    if (res.status === 403 || res.status === 429) throw new UpdateError(`${url.hostname} is limiting requests right now (HTTP ${res.status}). Try again later.`);
    if (!res.ok) throw new UpdateError(`${url.hostname} returned HTTP ${res.status}.`);
    return res;
  }
  throw new UpdateError('Too many redirects while downloading the update.');
}

async function readLimited(res: Response, limit: number): Promise<Buffer> {
  const declared = Number(res.headers.get('content-length') ?? '0');
  if (declared > limit) throw new UpdateError('The download is larger than expected.');
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new UpdateError('The download is larger than expected.');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function toRelease(raw: z.infer<typeof ReleaseJson>): Release | null {
  if (raw.draft || raw.prerelease || !parseVersion(raw.tag_name)) return null;
  const version = raw.tag_name.replace(/^v/, '');
  const pkg = raw.assets.find((a) => a.name === `career-strike-${version}.tgz`);
  const sum = raw.assets.find((a) => a.name === `career-strike-${version}.tgz.sha256`);
  if (!pkg || !sum) return null;
  return {
    version,
    tag: raw.tag_name,
    name: raw.name || `Career Strike ${version}`,
    notes: (raw.body ?? '').trim(),
    url: raw.html_url,
    publishedAt: raw.published_at ?? null,
    packageUrl: pkg.browser_download_url,
    checksumUrl: sum.browser_download_url,
  };
}

/** Published releases that can be installed, newest first. */
export async function listReleases(opts: ReleaseSourceOptions = {}): Promise<Release[]> {
  const res = await get(`${releasesUrl(opts)}?per_page=30`, 'application/vnd.github+json', opts);
  let json: unknown;
  try {
    json = JSON.parse((await readLimited(res, MAX_JSON_BYTES)).toString('utf8'));
  } catch {
    throw new UpdateError('The release list could not be read.');
  }
  const parsed = z.array(z.unknown()).safeParse(json);
  if (!parsed.success) throw new UpdateError('The release list could not be read.');
  return parsed.data
    .map((r) => ReleaseJson.safeParse(r))
    .flatMap((r) => (r.success ? [toRelease(r.data)] : []))
    .filter((r): r is Release => r !== null)
    .sort((a, b) => compareVersions(b.version, a.version));
}

export async function latestRelease(opts: ReleaseSourceOptions = {}): Promise<Release | null> {
  return (await listReleases(opts))[0] ?? null;
}

/**
 * Download a release package into `dir`, check it against the published SHA-256 and confirm the
 * archive is the Career Strike version it claims to be. Returns the verified file path.
 */
export async function downloadRelease(release: Release, dir: string, opts: ReleaseSourceOptions = {}): Promise<{ file: string; sha256: string }> {
  const [sumBuffer, body] = await Promise.all([
    get(release.checksumUrl, 'application/octet-stream', opts).then((res) => readLimited(res, 4096)),
    get(release.packageUrl, 'application/octet-stream', opts).then((res) => readLimited(res, MAX_PACKAGE_BYTES)),
  ]);
  const sumText = sumBuffer.toString('utf8');
  const expected = /^([a-f0-9]{64})\b/i.exec(sumText.trim())?.[1]?.toLowerCase();
  if (!expected) throw new UpdateError('The published checksum could not be read.');

  const actual = createHash('sha256').update(body).digest('hex');
  if (actual !== expected) throw new UpdateError(`The download does not match its published checksum (expected ${expected.slice(0, 12)}…, got ${actual.slice(0, 12)}…). Nothing was installed.`);

  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `career-strike-${release.version}.tgz`);
  fs.writeFileSync(file, body, { mode: 0o600 });
  return { file, sha256: actual };
}
