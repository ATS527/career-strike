import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '../store/db.js';
import { blocksToText, textToBlocks } from '../sources/html.js';
import { safeHttpUrl, unresolvedFacts } from '../sources/normalize.js';
import type { NormalizedPosting, PublishedSalary, RemotePolicy, TextBlock } from '../sources/types.js';
import { evaluateFit, type Fit, type FitSettings, type Tier } from '../matching/fit.js';
import { extractRequirements, type PostingRequirements, REQUIREMENTS_VERSION } from '../matching/requirements.js';
import type { CandidateProfile } from './profile.js';

/** A posting verified within this window is shown as open; older ones as "may have closed". */
export const FRESH_FOR_MS = 72 * 60 * 60 * 1000;

export type StoredStatus = 'OPEN' | 'CLOSED' | 'UNVERIFIED';
/** What the dashboard may claim right now, given how recently the posting was verified. */
export type EffectiveStatus = 'OPEN' | 'STALE' | 'CLOSED' | 'UNVERIFIED';
export type Disposition = 'none' | 'shortlisted' | 'excluded';

export interface JobSummary {
  id: string;
  employer: string;
  title: string;
  locationText: string | null;
  remotePolicy: RemotePolicy;
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
  /** Present when a candidate context was supplied. SENSITIVE: derived from the profile. */
  fit?: FitSummary;
}

export interface FitSummary {
  tier: Tier;
  tierRule: string;
  matchedSkills: string[];
  missingRequiredSkills: string[];
  immediateStartAsked: boolean;
}

/** Everything matching needs about the candidate. */
export interface CandidateContext {
  excludedEmployers: readonly string[];
  profile?: CandidateProfile;
  settings?: FitSettings;
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
  fitDetail?: Fit;
}

const newId = (prefix: string): string => `${prefix}_${randomBytes(9).toString('base64url')}`;
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
const norm = (value: string | null): string =>
  (value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Postings for the same role at the same employer and place share this key across sources. */
export function duplicateKey(employer: string, title: string, location: string | null): string {
  return sha256(`${norm(employer)}|${norm(title)}|${norm(location)}`);
}

export function effectiveStatus(status: StoredStatus, lastVerifiedAt: string | null, now = Date.now()): EffectiveStatus {
  if (status !== 'OPEN') return status;
  if (!lastVerifiedAt || now - Date.parse(lastVerifiedAt) > FRESH_FOR_MS) return 'STALE';
  return 'OPEN';
}

export interface SyncResult {
  fetched: number;
  added: number;
  updated: number;
  closed: number;
}

/**
 * Record a complete, successful listing of one board. Postings present are OPEN and verified now;
 * previously open postings from this board that are absent have been taken down: CLOSED.
 * Call only with a full successful response — a failed fetch must not reach this function.
 */
export function syncBoard(db: Db, source: string, board: string, postings: NormalizedPosting[], now = new Date()): SyncResult {
  const at = now.toISOString();
  const result: SyncResult = { fetched: postings.length, added: 0, updated: 0, closed: 0 };

  const findSource = db.prepare('SELECT job_id, content_hash FROM job_sources WHERE source = ? AND board = ? AND source_job_id = ?');
  const insertJob = db.prepare(`
    INSERT INTO jobs (id, canonical_key, duplicate_key, employer, title, location_text, remote_policy, employment_type,
      department, salary_json, description_json, description_text, apply_url, posting_url, published_at, status,
      first_seen_at, last_seen_at, last_verified_at, unresolved_json, requirements_json, requirements_version)
    VALUES (@id, @canonical, @dup, @employer, @title, @location, @remote, @employment, @department, @salary, @descJson,
      @descText, @apply, @posting, @published, 'OPEN', @at, @at, @at, @unresolved, @reqJson, @reqVersion)`);
  const updateJob = db.prepare(`
    UPDATE jobs SET duplicate_key = @dup, employer = @employer, title = @title, location_text = @location,
      remote_policy = @remote, employment_type = @employment, department = @department, salary_json = @salary,
      description_json = @descJson, description_text = @descText, apply_url = @apply, posting_url = @posting,
      published_at = @published, status = 'OPEN', closed_at = NULL, last_seen_at = @at, last_verified_at = @at,
      unresolved_json = @unresolved, requirements_json = @reqJson, requirements_version = @reqVersion
    WHERE id = @id`);
  const touchJob = db.prepare("UPDATE jobs SET status = 'OPEN', closed_at = NULL, last_seen_at = ?, last_verified_at = ? WHERE id = ?");
  const insertSource = db.prepare(
    'INSERT INTO job_sources (job_id, source, board, source_job_id, source_url, fetched_at, content_hash) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  const updateSource = db.prepare(
    'UPDATE job_sources SET source_url = ?, fetched_at = ?, content_hash = ? WHERE source = ? AND board = ? AND source_job_id = ?',
  );

  db.transaction(() => {
    const seen = new Set<string>();
    for (const p of postings) {
      if (seen.has(p.sourceJobId)) continue;
      seen.add(p.sourceJobId);
      const hash = sha256(JSON.stringify(p));
      const params = {
        canonical: `${source}:${board}:${p.sourceJobId}`,
        dup: duplicateKey(p.employer, p.title, p.locationText),
        employer: p.employer,
        title: p.title,
        location: p.locationText,
        remote: p.remotePolicy,
        employment: p.employmentType,
        department: p.department,
        salary: p.salary ? JSON.stringify(p.salary) : null,
        descJson: JSON.stringify(p.description),
        descText: blocksToText(p.description),
        apply: p.applyUrl,
        posting: p.postingUrl,
        published: p.publishedAt,
        unresolved: JSON.stringify(p.unresolved),
        reqJson: JSON.stringify(extractRequirements(p.title, p.description)),
        reqVersion: REQUIREMENTS_VERSION,
        at,
      };
      const existing = findSource.get(source, board, p.sourceJobId) as { job_id: string; content_hash: string } | undefined;
      if (existing) {
        if (existing.content_hash === hash) touchJob.run(at, at, existing.job_id);
        else updateJob.run({ ...params, id: existing.job_id });
        updateSource.run(p.postingUrl, at, hash, source, board, p.sourceJobId);
        result.updated += 1;
      } else {
        const id = newId('job');
        insertJob.run({ ...params, id });
        insertSource.run(id, source, board, p.sourceJobId, p.postingUrl, at, hash);
        result.added += 1;
      }
    }

    const open = db
      .prepare(
        `SELECT j.id, s.source_job_id FROM jobs j JOIN job_sources s ON s.job_id = j.id
         WHERE s.source = ? AND s.board = ? AND j.status = 'OPEN'`,
      )
      .all(source, board) as { id: string; source_job_id: string }[];
    const close = db.prepare("UPDATE jobs SET status = 'CLOSED', closed_at = ?, last_verified_at = ? WHERE id = ?");
    for (const row of open) {
      if (!seen.has(row.source_job_id)) {
        close.run(at, at, row.id);
        result.closed += 1;
      }
    }
    linkDuplicates(db);
  })();
  return result;
}

/**
 * Point every job at the primary job with the same duplicate key: the earliest one that is not
 * closed, so a closed listing never hides a live one for the same role.
 */
function linkDuplicates(db: Db): void {
  db.exec(`
    UPDATE jobs SET duplicate_of = (
      SELECT first.id FROM jobs first
      WHERE first.duplicate_key = jobs.duplicate_key
      ORDER BY first.status = 'CLOSED', first.first_seen_at, first.id LIMIT 1
    );
    UPDATE jobs SET duplicate_of = NULL WHERE duplicate_of = id;
  `);
}

/** Recompute requirements stored by an older extraction version. Returns how many were updated. */
export function backfillRequirements(db: Db): number {
  const rows = db
    .prepare('SELECT id, title, description_json FROM jobs WHERE requirements_version != ?')
    .all(REQUIREMENTS_VERSION) as { id: string; title: string; description_json: string }[];
  const update = db.prepare('UPDATE jobs SET requirements_json = ?, requirements_version = ? WHERE id = ?');
  db.transaction(() => {
    for (const r of rows) update.run(JSON.stringify(extractRequirements(r.title, JSON.parse(r.description_json) as TextBlock[])), REQUIREMENTS_VERSION, r.id);
  })();
  return rows.length;
}

export const ManualJobInput = z
  .object({
    employer: z.string().trim().min(1, 'Enter the employer’s name').max(200),
    title: z.string().trim().min(1, 'Enter the job title').max(300),
    url: z
      .string()
      .trim()
      .max(2000)
      .refine((u) => u === '' || safeHttpUrl(u) !== null, 'Use an http(s) link to the official posting')
      .optional(),
    location: z.string().trim().max(200).optional(),
    remotePolicy: z.enum(['remote', 'hybrid', 'onsite', 'unknown']).default('unknown'),
    description: z.string().max(100_000).default(''),
  })
  .strict();

/** A job the candidate entered by hand. It stays UNVERIFIED: Career Strike has not seen the posting. */
export function addManualJob(db: Db, input: z.infer<typeof ManualJobInput>, now = new Date()): string {
  const at = now.toISOString();
  const id = newId('job');
  const url = input.url ? safeHttpUrl(input.url) : null;
  const description = textToBlocks(input.description);
  const location = input.location || null;
  const unresolved = [
    'Entered manually: Career Strike has not verified that this posting exists or is open.',
    ...unresolvedFacts({ remotePolicy: input.remotePolicy, employmentType: 'unknown', salary: null, locationText: location }),
  ];
  db.transaction(() => {
    db.prepare(
      `INSERT INTO jobs (id, canonical_key, duplicate_key, employer, title, location_text, remote_policy, employment_type,
        description_json, description_text, apply_url, posting_url, status, first_seen_at, last_seen_at, unresolved_json,
        requirements_json, requirements_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'unknown', ?, ?, ?, ?, 'UNVERIFIED', ?, ?, ?, ?, ?)`,
    ).run(
      id,
      `manual:${id}`,
      duplicateKey(input.employer, input.title, location),
      input.employer,
      input.title,
      location,
      input.remotePolicy,
      JSON.stringify(description),
      blocksToText(description),
      url,
      url,
      at,
      at,
      JSON.stringify(unresolved),
      JSON.stringify(extractRequirements(input.title, description)),
      REQUIREMENTS_VERSION,
    );
    db.prepare(
      'INSERT INTO job_sources (job_id, source, board, source_job_id, source_url, fetched_at, content_hash) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(id, 'manual', 'manual', id, url, at, sha256(JSON.stringify(input)));
    linkDuplicates(db);
  })();
  return id;
}

/** Query-string boolean: only "true"/"1" are true. (z.coerce.boolean would turn "false" into true.) */
const flag = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1')
  .default(false);

export const JobQuery = z
  .object({
    q: z.string().trim().max(200).optional(),
    status: z.enum(['active', 'OPEN', 'STALE', 'CLOSED', 'UNVERIFIED', 'all']).default('active'),
    remote: z.enum(['remote', 'hybrid', 'onsite', 'unknown']).optional(),
    disposition: z.enum(['none', 'shortlisted', 'excluded', 'not_excluded']).default('not_excluded'),
    source: z.enum(['greenhouse', 'lever', 'ashby', 'manual']).optional(),
    includeExcludedEmployers: flag,
    includeDuplicates: flag,
    sort: z.enum(['newest', 'recently_verified', 'employer', 'title', 'best_fit']).default('newest'),
    tier: z.enum(['strong', 'possible', 'stretch', 'ineligible', 'unknown', 'eligible']).optional(),
    immediateStart: flag,
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

interface JobRow {
  id: string;
  employer: string;
  title: string;
  location_text: string | null;
  remote_policy: RemotePolicy;
  employment_type: string;
  salary_json: string | null;
  status: StoredStatus;
  first_seen_at: string;
  last_verified_at: string | null;
  published_at: string | null;
  duplicate_of: string | null;
  disposition: Disposition | null;
  sources: string;
  requirements_json: string | null;
  description_text: string;
}

const SUMMARY_SELECT = `
  SELECT j.id, j.employer, j.title, j.location_text, j.remote_policy, j.employment_type, j.salary_json, j.status,
    j.first_seen_at, j.last_verified_at, j.published_at, j.duplicate_of, u.disposition, j.requirements_json, j.description_text,
    (SELECT group_concat(DISTINCT s.source) FROM job_sources s WHERE s.job_id = j.id) AS sources
  FROM jobs j LEFT JOIN job_user_state u ON u.job_id = j.id`;

const EMPTY_REQUIREMENTS: PostingRequirements = {
  version: REQUIREMENTS_VERSION,
  skills: [],
  yearsRequired: null,
  seniority: null,
  urgency: [],
  locationConstraints: [],
};

function requirementsOf(row: { requirements_json: string | null }): PostingRequirements {
  return row.requirements_json ? (JSON.parse(row.requirements_json) as PostingRequirements) : EMPTY_REQUIREMENTS;
}

function fitFor(row: JobRow, status: EffectiveStatus, ctx: CandidateContext): Fit | undefined {
  if (!ctx.profile || !ctx.settings) return undefined;
  return evaluateFit(
    {
      title: row.title,
      employer: row.employer,
      locationText: row.location_text,
      remotePolicy: row.remote_policy,
      employmentType: row.employment_type,
      salary: row.salary_json ? (JSON.parse(row.salary_json) as PublishedSalary) : null,
      status,
      descriptionText: row.description_text,
      requirements: requirementsOf(row),
    },
    ctx.profile,
    ctx.settings,
  );
}

function summariseFit(fit: Fit): FitSummary {
  return {
    tier: fit.tier,
    tierRule: fit.tierRule,
    matchedSkills: fit.matchedSkills,
    missingRequiredSkills: fit.missingRequiredSkills,
    immediateStartAsked: fit.immediateStart.asked,
  };
}

function toSummary(row: JobRow, excludedEmployers: Set<string>, now: number, ctx?: CandidateContext): JobSummary & { fitDetail?: Fit } {
  const status = effectiveStatus(row.status, row.last_verified_at, now);
  const fit = ctx ? fitFor(row, status, ctx) : undefined;
  return {
    id: row.id,
    employer: row.employer,
    title: row.title,
    locationText: row.location_text,
    remotePolicy: row.remote_policy,
    employmentType: row.employment_type,
    salary: row.salary_json ? (JSON.parse(row.salary_json) as PublishedSalary) : null,
    status,
    firstSeenAt: row.first_seen_at,
    lastVerifiedAt: row.last_verified_at,
    publishedAt: row.published_at,
    sources: row.sources ? row.sources.split(',') : [],
    duplicateOf: row.duplicate_of,
    disposition: row.disposition ?? 'none',
    employerExcluded: excludedEmployers.has(norm(row.employer)),
    ...(fit ? { fit: summariseFit(fit), fitDetail: fit } : {}),
  };
}

const TIER_ORDER: Record<Tier, number> = { strong: 0, possible: 1, stretch: 2, unknown: 3, ineligible: 4 };

export function listJobs(
  db: Db,
  query: z.infer<typeof JobQuery>,
  ctx: CandidateContext,
  now = Date.now(),
): { total: number; jobs: JobSummary[]; fitAvailable: boolean } {
  const excludedEmployers = ctx.excludedEmployers;
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  const freshSince = new Date(now - FRESH_FOR_MS).toISOString();

  if (query.q) {
    query.q
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 8)
      .forEach((term, i) => {
        where.push(`(j.title LIKE @q${i} ESCAPE '\\' OR j.employer LIKE @q${i} ESCAPE '\\' OR j.description_text LIKE @q${i} ESCAPE '\\')`);
        params[`q${i}`] = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      });
  }
  params.fresh = freshSince;
  if (query.status === 'active') where.push("(j.status = 'UNVERIFIED' OR j.status = 'OPEN')");
  else if (query.status === 'OPEN') where.push("j.status = 'OPEN' AND j.last_verified_at >= @fresh");
  else if (query.status === 'STALE') where.push("j.status = 'OPEN' AND (j.last_verified_at IS NULL OR j.last_verified_at < @fresh)");
  else if (query.status !== 'all') where.push(`j.status = '${query.status}'`);
  if (query.remote) {
    where.push('j.remote_policy = @remote');
    params.remote = query.remote;
  }
  if (query.source) {
    where.push('EXISTS (SELECT 1 FROM job_sources s WHERE s.job_id = j.id AND s.source = @source)');
    params.source = query.source;
  }
  if (query.disposition === 'not_excluded') where.push("COALESCE(u.disposition, 'none') != 'excluded'");
  else {
    where.push("COALESCE(u.disposition, 'none') = @disposition");
    params.disposition = query.disposition;
  }
  if (!query.includeDuplicates) where.push('j.duplicate_of IS NULL');

  const excluded = new Set(excludedEmployers.map(norm));
  const order = {
    newest: 'COALESCE(j.published_at, j.first_seen_at) DESC, j.id',
    recently_verified: 'j.last_verified_at DESC, j.id',
    employer: 'j.employer COLLATE NOCASE, j.title COLLATE NOCASE',
    title: 'j.title COLLATE NOCASE, j.employer COLLATE NOCASE',
    best_fit: 'COALESCE(j.published_at, j.first_seen_at) DESC, j.id',
  }[query.sort];

  const rows = db.prepare(`${SUMMARY_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${order}`).all(params) as JobRow[];
  const fitAvailable = Boolean(ctx.profile && ctx.settings);
  // Employer exclusion, fit and urgency are computed per job, so they are applied here.
  let visible = rows.map((r) => toSummary(r, excluded, now, ctx)).filter((j) => query.includeExcludedEmployers || !j.employerExcluded);
  if (query.immediateStart) visible = visible.filter((j) => j.fit?.immediateStartAsked ?? requirementsOf(rows.find((r) => r.id === j.id)!).urgency.length > 0);
  if (query.tier && fitAvailable) {
    visible = visible.filter((j) => (query.tier === 'eligible' ? j.fit!.tier !== 'ineligible' : j.fit!.tier === query.tier));
  }
  if (query.sort === 'best_fit' && fitAvailable) {
    // Stable: ties keep newest-first order. An immediate-start request the candidate can meet ranks first within a tier.
    const urgentMatch = (j: JobSummary & { fitDetail?: Fit }): number => (j.fitDetail?.immediateStart.asked && j.fitDetail.immediateStart.candidateAvailable ? 0 : 1);
    visible = [...visible].sort((a, b) => TIER_ORDER[a.fit!.tier] - TIER_ORDER[b.fit!.tier] || urgentMatch(a) - urgentMatch(b));
  }
  const page = visible.slice(query.offset, query.offset + query.limit).map(({ fitDetail: _omit, ...j }) => j);
  return { total: visible.length, jobs: page, fitAvailable };
}

export function getJob(db: Db, id: string, ctx: CandidateContext, now = Date.now()): JobDetail | null {
  const excludedEmployers = ctx.excludedEmployers;
  const row = db.prepare(`${SUMMARY_SELECT} WHERE j.id = ?`).get(id) as JobRow | undefined;
  if (!row) return null;
  const extra = db
    .prepare('SELECT department, description_json, apply_url, posting_url, closed_at, unresolved_json, duplicate_key FROM jobs WHERE id = ?')
    .get(id) as {
    department: string | null;
    description_json: string;
    apply_url: string | null;
    posting_url: string | null;
    closed_at: string | null;
    unresolved_json: string;
    duplicate_key: string;
  };
  const sourceRecords = (
    db.prepare('SELECT source, board, source_job_id, source_url, fetched_at FROM job_sources WHERE job_id = ? ORDER BY fetched_at').all(id) as {
      source: string;
      board: string;
      source_job_id: string;
      source_url: string | null;
      fetched_at: string;
    }[]
  ).map((s) => ({ source: s.source, board: s.board, sourceJobId: s.source_job_id, url: s.source_url, fetchedAt: s.fetched_at }));
  const duplicates = (
    db
      .prepare(
        `SELECT j.id, j.title, j.employer, (SELECT group_concat(DISTINCT s.source) FROM job_sources s WHERE s.job_id = j.id) AS sources
         FROM jobs j WHERE j.duplicate_key = ? AND j.id != ? ORDER BY j.first_seen_at`,
      )
      .all(extra.duplicate_key, id) as { id: string; title: string; employer: string; sources: string | null }[]
  ).map((d) => ({ id: d.id, title: d.title, employer: d.employer, sources: d.sources ? d.sources.split(',') : [] }));

  const { fitDetail, ...summary } = toSummary(row, new Set(excludedEmployers.map(norm)), now, ctx);
  return {
    ...summary,
    ...(fitDetail ? { fitDetail } : {}),
    requirements: requirementsOf(row),
    department: extra.department,
    description: JSON.parse(extra.description_json) as TextBlock[],
    applyUrl: extra.apply_url,
    postingUrl: extra.posting_url,
    closedAt: extra.closed_at,
    unresolved: JSON.parse(extra.unresolved_json) as string[],
    sourceRecords,
    duplicates,
  };
}

export function setDisposition(db: Db, id: string, disposition: Disposition, actor: string): boolean {
  const exists = db.prepare('SELECT 1 FROM jobs WHERE id = ?').get(id);
  if (!exists) return false;
  const at = new Date().toISOString();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO job_user_state (job_id, disposition, updated_at, updated_by) VALUES (?, ?, ?, ?)
       ON CONFLICT(job_id) DO UPDATE SET disposition = excluded.disposition, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    ).run(id, disposition, at, actor);
    db.prepare('INSERT INTO audit_events (at, actor, action, subject, detail_json) VALUES (?, ?, ?, ?, ?)').run(
      at,
      actor,
      'job.disposition',
      id,
      JSON.stringify({ disposition }),
    );
  })();
  return true;
}

export interface JobCounts {
  open: number;
  stale: number;
  unverified: number;
  shortlisted: number;
  /** Verified-open roles the candidate has neither shortlisted nor excluded. */
  unreviewed: number;
  newSince24h: number;
}

export function jobCounts(db: Db, now = Date.now()): JobCounts {
  const fresh = new Date(now - FRESH_FOR_MS).toISOString();
  const day = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const row = db
    .prepare(
      `SELECT
        SUM(CASE WHEN j.status = 'OPEN' AND j.last_verified_at >= @fresh THEN 1 ELSE 0 END) AS open,
        SUM(CASE WHEN j.status = 'OPEN' AND (j.last_verified_at IS NULL OR j.last_verified_at < @fresh) THEN 1 ELSE 0 END) AS stale,
        SUM(CASE WHEN j.status = 'UNVERIFIED' THEN 1 ELSE 0 END) AS unverified,
        SUM(CASE WHEN u.disposition = 'shortlisted' AND j.status != 'CLOSED' THEN 1 ELSE 0 END) AS shortlisted,
        SUM(CASE WHEN j.status = 'OPEN' AND j.last_verified_at >= @fresh AND COALESCE(u.disposition, 'none') = 'none' THEN 1 ELSE 0 END) AS unreviewed,
        SUM(CASE WHEN j.first_seen_at >= @day AND j.status = 'OPEN' THEN 1 ELSE 0 END) AS newSince24h
       FROM jobs j LEFT JOIN job_user_state u ON u.job_id = j.id WHERE j.duplicate_of IS NULL`,
    )
    .get({ fresh, day }) as Record<keyof JobCounts, number | null>;
  return {
    open: row.open ?? 0,
    stale: row.stale ?? 0,
    unverified: row.unverified ?? 0,
    shortlisted: row.shortlisted ?? 0,
    unreviewed: row.unreviewed ?? 0,
    newSince24h: row.newSince24h ?? 0,
  };
}
