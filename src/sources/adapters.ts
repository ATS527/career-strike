import { decodeHTML } from 'entities';
import { z } from 'zod';
import { type FetchImpl, guardedGetJson } from './fetch-guard.js';
import { htmlToBlocks } from './html.js';
import {
  employmentTypeFrom,
  isoOrNull,
  marketFacts,
  publishedSalary,
  remotePolicyFrom,
  safeHttpUrl,
  unresolvedFacts,
} from './normalize.js';
import {
  type ApplicationQuestion,
  type NormalizedPosting,
  type SourceAdapter,
  SourceError,
  type SourceId,
} from './types.js';

// Schemas describe only the fields Career Strike reads; unknown fields are ignored.
// Shapes were checked against live responses from each public API on 2026-10-30.

const BOARD = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

export function assertBoard(board: string): string {
  if (!BOARD.test(board))
    throw new SourceError('not_found', 'Board names contain only letters, digits, dot, dash and underscore');
  return board;
}

function parse<T>(schema: z.ZodType<T>, data: unknown, source: string): T {
  const result = schema.safeParse(data);
  if (!result.success) throw new SourceError('schema', `${source} returned data in an unexpected shape`);
  return result.data;
}

const nullableString = z.string().nullish();

// ---- Greenhouse: https://developers.greenhouse.io/job-board.html ----

const GreenhouseJobs = z.object({
  jobs: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
      company_name: nullableString,
      absolute_url: nullableString,
      location: z.object({ name: nullableString }).nullish(),
      updated_at: nullableString,
      first_published: nullableString,
      content: nullableString,
      departments: z.array(z.object({ name: z.string() })).nullish(),
      metadata: z.array(z.object({ name: z.string(), value: z.unknown() })).nullish(),
    }),
  ),
});

const GreenhouseQuestion = z.object({
  label: z.string(),
  required: z.boolean().nullish(),
  fields: z.array(
    z.object({ name: z.string(), type: z.string(), values: z.array(z.object({ label: z.string() })).nullish() }),
  ),
});
const GreenhouseJobQuestions = z.object({
  questions: z.array(GreenhouseQuestion).nullish(),
  location_questions: z.array(GreenhouseQuestion).nullish(),
  demographic_questions: z.object({ questions: z.array(z.object({ label: z.string() })).nullish() }).nullish(),
  // Shape varies by employer and is rarely present; read defensively so it can never break the form.
  compliance: z.unknown().optional(),
});

function complianceLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((c) =>
    c && typeof c === 'object' && Array.isArray((c as { questions?: unknown }).questions)
      ? (c as { questions: unknown[] }).questions
          .map((q) =>
            q && typeof q === 'object' && typeof (q as { label?: unknown }).label === 'string'
              ? (q as { label: string }).label
              : null,
          )
          .filter((l): l is string => l !== null)
      : [],
  );
}

function greenhouseQuestion(q: z.infer<typeof GreenhouseQuestion>, voluntary: boolean): ApplicationQuestion | null {
  const visible = q.fields.filter((f) => f.type !== 'input_hidden');
  const field = visible.find((f) => f.type === 'input_file') ?? visible[0];
  if (!field) return null;
  const kind: ApplicationQuestion['kind'] =
    field.type === 'input_file'
      ? 'file'
      : field.type === 'textarea'
        ? 'long_text'
        : field.type.startsWith('multi_value')
          ? 'choice'
          : 'text';
  return {
    key: field.name,
    label: q.label,
    required: q.required === true,
    kind,
    options: (field.values ?? []).map((v) => v.label),
    voluntary,
  };
}

function greenhouse(fetchImpl?: FetchImpl): SourceAdapter {
  return {
    id: 'greenhouse',
    label: 'Greenhouse',
    async applicationQuestions(board, sourceJobId, signal) {
      if (!/^\d{1,20}$/.test(sourceJobId)) throw new SourceError('not_found', 'Not a Greenhouse job id');
      const data = await guardedGetJson(
        `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(assertBoard(board))}/jobs/${sourceJobId}?questions=true`,
        // Drafting waits on this; fall back to the standard fields rather than keep the candidate waiting.
        { fetchImpl, signal, timeoutMs: 8_000, minIntervalMs: 0 },
      );
      const parsed = parse(GreenhouseJobQuestions, data, 'Greenhouse');
      const main = [...(parsed.questions ?? []), ...(parsed.location_questions ?? [])].map((q) =>
        greenhouseQuestion(q, false),
      );
      // Demographic and compliance questions are voluntary; Career Strike lists them but never answers.
      const voluntary = [
        ...(parsed.demographic_questions?.questions ?? []).map((q) => q.label),
        ...complianceLabels(parsed.compliance),
      ].map(
        (label): ApplicationQuestion => ({
          key: `voluntary:${label}`,
          label,
          required: false,
          kind: 'choice',
          options: [],
          voluntary: true,
        }),
      );
      return [...main.filter((q): q is ApplicationQuestion => q !== null), ...voluntary];
    },
    boardUrl: (board) => `https://job-boards.greenhouse.io/${encodeURIComponent(board)}`,
    async list(board, signal) {
      const data = await guardedGetJson(
        `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(assertBoard(board))}/jobs?content=true`,
        { fetchImpl, signal },
      );
      return parse(GreenhouseJobs, data, 'Greenhouse').jobs.map((j): NormalizedPosting => {
        // Workplace type is an employer-defined custom field on Greenhouse; use it only if present.
        const workplace = j.metadata?.find((m) => /workplace|remote/i.test(m.name))?.value;
        const remotePolicy = remotePolicyFrom(typeof workplace === 'string' ? workplace : null);
        const employmentType = employmentTypeFrom(
          String(j.metadata?.find((m) => /employment|job type|time type/i.test(m.name))?.value ?? ''),
        );
        const locationText = j.location?.name?.trim() || null;
        const base = { remotePolicy, employmentType, salary: null, locationText };
        return {
          source: 'greenhouse',
          board,
          sourceJobId: String(j.id),
          employer: j.company_name?.trim() || board,
          title: j.title.trim(),
          locationText,
          remotePolicy,
          employmentType,
          department: j.departments?.[0]?.name ?? null,
          salary: null,
          // Greenhouse escapes the posting HTML once more; decode that layer, then parse the markup.
          description: htmlToBlocks(decodeHTML(j.content ?? '')),
          applyUrl: safeHttpUrl(j.absolute_url),
          postingUrl: safeHttpUrl(j.absolute_url),
          publishedAt: isoOrNull(j.first_published ?? j.updated_at),
          market: marketFacts(locationText, remotePolicy),
          unresolved: unresolvedFacts(base),
        };
      });
    },
  };
}

// ---- Lever: https://github.com/lever/postings-api ----

const LeverPostings = z.array(
  z.object({
    id: z.string(),
    text: z.string(),
    categories: z
      .object({
        commitment: nullableString,
        department: nullableString,
        location: nullableString,
        team: nullableString,
      })
      .nullish(),
    workplaceType: nullableString,
    createdAt: z.number().nullish(),
    hostedUrl: nullableString,
    applyUrl: nullableString,
    description: nullableString,
    lists: z.array(z.object({ text: z.string(), content: z.string() })).nullish(),
    additional: nullableString,
    salaryRange: z
      .object({
        currency: nullableString,
        interval: nullableString,
        min: z.number().nullish(),
        max: z.number().nullish(),
      })
      .nullish(),
  }),
);

function lever(fetchImpl?: FetchImpl): SourceAdapter {
  return {
    id: 'lever',
    label: 'Lever',
    boardUrl: (board) => `https://jobs.lever.co/${encodeURIComponent(board)}`,
    async list(board, signal) {
      const data = await guardedGetJson(
        `https://api.lever.co/v0/postings/${encodeURIComponent(assertBoard(board))}?mode=json`,
        {
          fetchImpl,
          signal,
        },
      );
      return parse(LeverPostings, data, 'Lever').map((p): NormalizedPosting => {
        const remotePolicy = remotePolicyFrom(p.workplaceType);
        const employmentType = employmentTypeFrom(p.categories?.commitment);
        const salary = p.salaryRange
          ? publishedSalary(p.salaryRange.currency, p.salaryRange.min, p.salaryRange.max, p.salaryRange.interval)
          : null;
        const locationText = p.categories?.location?.trim() || null;
        const html = [
          p.description ?? '',
          ...(p.lists ?? []).map((l) => `<h3>${escapeHtml(l.text)}</h3><ul>${l.content}</ul>`),
          p.additional ?? '',
        ].join('\n');
        return {
          source: 'lever',
          board,
          sourceJobId: p.id,
          employer: board,
          title: p.text.trim(),
          locationText,
          remotePolicy,
          employmentType,
          department: p.categories?.department ?? p.categories?.team ?? null,
          salary,
          description: htmlToBlocks(html),
          applyUrl: safeHttpUrl(p.applyUrl) ?? safeHttpUrl(p.hostedUrl),
          postingUrl: safeHttpUrl(p.hostedUrl),
          publishedAt: isoOrNull(p.createdAt),
          market: marketFacts(locationText, remotePolicy),
          unresolved: [
            ...unresolvedFacts({ remotePolicy, employmentType, salary, locationText }),
            'Employer name is the Lever board name; Lever does not publish a display name.',
          ],
        };
      });
    },
  };
}

// ---- Ashby: https://developers.ashbyhq.com/docs/public-job-posting-api ----

const AshbyBoard = z.object({
  jobs: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      department: nullableString,
      team: nullableString,
      employmentType: nullableString,
      location: nullableString,
      isListed: z.boolean().nullish(),
      isRemote: z.boolean().nullish(),
      workplaceType: nullableString,
      publishedAt: nullableString,
      jobUrl: nullableString,
      applyUrl: nullableString,
      descriptionHtml: nullableString,
      compensation: z
        .object({
          summaryComponents: z
            .array(
              z.object({
                compensationType: nullableString,
                interval: nullableString,
                currencyCode: nullableString,
                minValue: z.number().nullish(),
                maxValue: z.number().nullish(),
              }),
            )
            .nullish(),
        })
        .nullish(),
    }),
  ),
});

function ashby(fetchImpl?: FetchImpl): SourceAdapter {
  return {
    id: 'ashby',
    label: 'Ashby',
    boardUrl: (board) => `https://jobs.ashbyhq.com/${encodeURIComponent(board)}`,
    async list(board, signal) {
      const data = await guardedGetJson(
        `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(assertBoard(board))}?includeCompensation=true`,
        { fetchImpl, signal },
      );
      return parse(AshbyBoard, data, 'Ashby')
        .jobs.filter((j) => j.isListed !== false)
        .map((j): NormalizedPosting => {
          const remotePolicy = j.workplaceType
            ? remotePolicyFrom(j.workplaceType)
            : j.isRemote === true
              ? 'remote'
              : 'unknown';
          const employmentType = employmentTypeFrom(j.employmentType?.replace(/([a-z])([A-Z])/g, '$1 $2'));
          const pay = j.compensation?.summaryComponents?.find((c) => c.compensationType === 'Salary');
          const salary = pay ? publishedSalary(pay.currencyCode, pay.minValue, pay.maxValue, pay.interval) : null;
          const locationText = j.location?.trim() || null;
          return {
            source: 'ashby',
            board,
            sourceJobId: j.id,
            employer: board,
            title: j.title.trim(),
            locationText,
            remotePolicy,
            employmentType,
            department: j.department ?? j.team ?? null,
            salary,
            description: htmlToBlocks(j.descriptionHtml ?? ''),
            applyUrl: safeHttpUrl(j.applyUrl) ?? safeHttpUrl(j.jobUrl),
            postingUrl: safeHttpUrl(j.jobUrl),
            publishedAt: isoOrNull(j.publishedAt),
            market: marketFacts(locationText, remotePolicy),
            unresolved: [
              ...unresolvedFacts({ remotePolicy, employmentType, salary, locationText }),
              'Employer name is the Ashby board name; Ashby does not publish a display name.',
            ],
          };
        });
    },
  };
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// ---- Practice board: served by the owned practice endpoint on this computer ----

const PracticeBoard = z.object({
  postings: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      employer: z.string(),
      location: nullableString,
      remote: z.enum(['remote', 'hybrid', 'onsite', 'unknown']),
      description: z.array(z.object({ type: z.enum(['heading', 'paragraph', 'item']), text: z.string() })),
    }),
  ),
});

/** Only a registered loopback practice endpoint is ever contacted. */
export function isPracticeOrigin(origin: string | null): origin is string {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    return u.protocol === 'http:' && u.hostname === '127.0.0.1' && Boolean(u.port) && u.origin === origin;
  } catch {
    return false;
  }
}

function practice(practiceOrigin: () => string | null, fetchImpl: FetchImpl = (u, i) => fetch(u, i)): SourceAdapter {
  return {
    id: 'practice',
    label: 'Practice board',
    boardUrl: (board) => `${practiceOrigin() ?? 'http://127.0.0.1'}/boards/${encodeURIComponent(board)}`,
    async list(board, signal) {
      const origin = practiceOrigin();
      if (!isPracticeOrigin(origin))
        throw new SourceError(
          'not_found',
          'The practice endpoint is not running. Start it with career-strike practice.',
        );
      let res: Response;
      try {
        res = await fetchImpl(`${origin}/boards/${encodeURIComponent(assertBoard(board))}`, {
          method: 'GET',
          redirect: 'manual',
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000),
        });
      } catch (err) {
        if (signal?.aborted) throw err;
        throw new SourceError(
          'outage',
          `The practice endpoint did not answer: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      if (res.status === 404) throw new SourceError('not_found', 'The practice endpoint has no such board');
      if (res.status === 429)
        throw new SourceError('rate_limited', 'The practice endpoint asked Career Strike to slow down');
      if (!res.ok) throw new SourceError('outage', `The practice endpoint returned HTTP ${res.status}`);
      return parse(PracticeBoard, await res.json(), 'The practice endpoint').postings.map((p) => ({
        source: 'practice' as const,
        board,
        sourceJobId: p.id,
        employer: p.employer,
        title: p.title,
        locationText: p.location ?? null,
        remotePolicy: p.remote,
        employmentType: 'full_time' as const,
        department: null,
        salary: null,
        description: p.description,
        applyUrl: `${origin}/applications`,
        postingUrl: null,
        publishedAt: null,
        market: marketFacts(p.location ?? null, p.remote),
        unresolved: ['Practice posting: not a real employer.'],
      }));
    },
  };
}

export function createAdapters(
  fetchImpl?: FetchImpl,
  opts: { practiceOrigin?: () => string | null } = {},
): Readonly<Record<SourceId, SourceAdapter>> {
  return {
    greenhouse: greenhouse(fetchImpl),
    lever: lever(fetchImpl),
    ashby: ashby(fetchImpl),
    practice: practice(opts.practiceOrigin ?? (() => null)),
  };
}

export const SOURCE_IDS: readonly SourceId[] = ['greenhouse', 'lever', 'ashby', 'practice'];
