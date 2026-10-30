// Synthetic job-board responses with the same shapes as the live public APIs (checked 2026-10-30).
// Employers, people and postings here are invented.

import type { FetchImpl } from '../../src/sources/fetch-guard.js';

export const XSS_HTML =
  '<p>Build things.</p><script>window.__pwned = 1</script><img src=x onerror="window.__pwned=2"><a href="javascript:alert(1)">click</a>' +
  '<iframe src="https://example.com"></iframe><style>body{display:none}</style><ul><li>Ship <b>quality</b></li><li>Mentor &amp; review</li></ul>';

export function greenhouseJobs(jobs: Partial<{ id: number; title: string; location: string; workplace: string; content: string }>[]) {
  return {
    jobs: jobs.map((j, i) => ({
      id: j.id ?? 1000 + i,
      internal_job_id: 1,
      title: j.title ?? `Synthetic Engineer ${i}`,
      company_name: 'Synthetic Labs',
      absolute_url: `https://careers.example.com/positions/${j.id ?? 1000 + i}`,
      location: { name: j.location ?? 'Remote - India' },
      updated_at: '2026-10-28T10:52:05-04:00',
      first_published: '2026-10-27T10:52:05-04:00',
      // Greenhouse escapes its HTML once more.
      content: (j.content ?? '<p>Synthetic posting.</p>').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
      departments: [{ id: 1, name: 'Engineering' }],
      metadata: j.workplace ? [{ id: 1, name: 'Workplace Type', value: j.workplace, value_type: 'single_select' }] : [],
    })),
    meta: { total: jobs.length },
  };
}

export function leverPostings(posts: Partial<{ id: string; text: string; commitment: string; workplaceType: string; applyUrl: string; salary: boolean }>[]) {
  return posts.map((p, i) => ({
    id: p.id ?? `lv-${i}`,
    text: p.text ?? `Synthetic Analyst ${i}`,
    categories: { commitment: p.commitment ?? 'Permanent', department: 'Data', location: 'Berlin', team: 'Platform', allLocations: ['Berlin'] },
    country: 'DE',
    workplaceType: p.workplaceType ?? 'hybrid',
    createdAt: 1792767640768,
    hostedUrl: `https://jobs.lever.co/synthetic/${p.id ?? `lv-${i}`}`,
    applyUrl: p.applyUrl ?? `https://jobs.lever.co/synthetic/${p.id ?? `lv-${i}`}/apply`,
    description: '<div>Synthetic description.</div>',
    descriptionPlain: 'Synthetic description.',
    lists: [{ text: 'What you will do', content: '<li>Analyse things</li><li>Present results</li>' }],
    additional: '<div>We value kindness.</div>',
    ...(p.salary ? { salaryRange: { currency: 'EUR', interval: 'per-year-salary', min: 60000, max: 80000 } } : {}),
  }));
}

export function ashbyBoard(jobs: Partial<{ id: string; title: string; workplaceType: string | null; isRemote: boolean | null; employmentType: string; salary: boolean; isListed: boolean }>[]) {
  return {
    apiVersion: '1',
    jobs: jobs.map((j, i) => ({
      id: j.id ?? `ab-${i}`,
      title: j.title ?? `Synthetic Researcher ${i}`,
      department: 'Research',
      team: 'Research',
      employmentType: j.employmentType ?? 'FullTime',
      location: 'San Francisco',
      secondaryLocations: [],
      publishedAt: '2026-10-01T00:03:20.653+00:00',
      isListed: j.isListed ?? true,
      isRemote: j.isRemote ?? null,
      workplaceType: j.workplaceType === undefined ? 'Hybrid' : j.workplaceType,
      jobUrl: `https://jobs.ashbyhq.com/synthetic/${j.id ?? `ab-${i}`}`,
      applyUrl: `https://jobs.ashbyhq.com/synthetic/${j.id ?? `ab-${i}`}/application`,
      descriptionHtml: '<p>Synthetic research role.</p>',
      compensation: j.salary
        ? {
            summaryComponents: [
              { compensationType: 'EquityCashValue', interval: '1 YEAR', currencyCode: 'USD', minValue: null, maxValue: null },
              { compensationType: 'Salary', interval: '1 YEAR', currencyCode: 'USD', minValue: 150000, maxValue: 200000 },
            ],
          }
        : { summaryComponents: [] },
    })),
  };
}

/** A fetch stand-in that serves fixed bodies by host, or fails as instructed. */
export function fakeFetch(routes: Record<string, unknown | ((url: URL) => Response | Promise<Response>)>): FetchImpl & { calls: string[] } {
  const calls: string[] = [];
  const impl = async (raw: string): Promise<Response> => {
    calls.push(raw);
    const url = new URL(raw);
    const route = routes[url.hostname];
    if (route === undefined) return new Response('not found', { status: 404 });
    if (typeof route === 'function') return (route as (u: URL) => Response | Promise<Response>)(url);
    return new Response(JSON.stringify(route), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return Object.assign(impl, { calls });
}
