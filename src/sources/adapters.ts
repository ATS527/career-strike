import { decodeHTML } from 'entities';
import { z } from 'zod';
import { type FetchImpl, guardedGetJson } from './fetch-guard.js';
import { htmlToBlocks } from './html.js';
import { employmentTypeFrom, isoOrNull, publishedSalary, remotePolicyFrom, safeHttpUrl, unresolvedFacts } from './normalize.js';
import { type NormalizedPosting, type SourceAdapter, SourceError, type SourceId } from './types.js';

// Schemas describe only the fields Career Strike reads; unknown fields are ignored.
// Shapes were checked against live responses from each public API on 2026-10-30.

const BOARD = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

export function assertBoard(board: string): string {
  if (!BOARD.test(board)) throw new SourceError('not_found', 'Board names contain only letters, digits, dot, dash and underscore');
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

function greenhouse(fetchImpl?: FetchImpl): SourceAdapter {
  return {
    id: 'greenhouse',
    label: 'Greenhouse',
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
      .object({ commitment: nullableString, department: nullableString, location: nullableString, team: nullableString })
      .nullish(),
    workplaceType: nullableString,
    createdAt: z.number().nullish(),
    hostedUrl: nullableString,
    applyUrl: nullableString,
    description: nullableString,
    lists: z.array(z.object({ text: z.string(), content: z.string() })).nullish(),
    additional: nullableString,
    salaryRange: z
      .object({ currency: nullableString, interval: nullableString, min: z.number().nullish(), max: z.number().nullish() })
      .nullish(),
  }),
);

function lever(fetchImpl?: FetchImpl): SourceAdapter {
  return {
    id: 'lever',
    label: 'Lever',
    boardUrl: (board) => `https://jobs.lever.co/${encodeURIComponent(board)}`,
    async list(board, signal) {
      const data = await guardedGetJson(`https://api.lever.co/v0/postings/${encodeURIComponent(assertBoard(board))}?mode=json`, {
        fetchImpl,
        signal,
      });
      return parse(LeverPostings, data, 'Lever').map((p): NormalizedPosting => {
        const remotePolicy = remotePolicyFrom(p.workplaceType);
        const employmentType = employmentTypeFrom(p.categories?.commitment);
        const salary = p.salaryRange ? publishedSalary(p.salaryRange.currency, p.salaryRange.min, p.salaryRange.max, p.salaryRange.interval) : null;
        const locationText = p.categories?.location?.trim() || null;
        const html = [p.description ?? '', ...(p.lists ?? []).map((l) => `<h3>${escapeHtml(l.text)}</h3><ul>${l.content}</ul>`), p.additional ?? ''].join('\n');
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
          const remotePolicy = j.workplaceType ? remotePolicyFrom(j.workplaceType) : j.isRemote === true ? 'remote' : 'unknown';
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

export function createAdapters(fetchImpl?: FetchImpl): Readonly<Record<SourceId, SourceAdapter>> {
  return { greenhouse: greenhouse(fetchImpl), lever: lever(fetchImpl), ashby: ashby(fetchImpl) };
}

export const SOURCE_IDS: readonly SourceId[] = ['greenhouse', 'lever', 'ashby'];
