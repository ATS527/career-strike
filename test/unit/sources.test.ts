import { describe, expect, it } from 'vitest';
import { createAdapters } from '../../src/sources/adapters.js';
import { assertAllowedUrl, guardedGetJson } from '../../src/sources/fetch-guard.js';
import { htmlToBlocks, textToBlocks } from '../../src/sources/html.js';
import { employmentTypeFrom, publishedSalary, remotePolicyFrom, salaryInterval } from '../../src/sources/normalize.js';
import { SourceError } from '../../src/sources/types.js';
import { ashbyBoard, fakeFetch, greenhouseJobs, leverPostings, XSS_HTML } from '../fixtures/ats.js';

const noWait = { minIntervalMs: 0 };

describe('posting HTML sanitisation', () => {
  it('keeps only text: scripts, handlers, iframes, styles and links never survive', () => {
    const blocks = htmlToBlocks(XSS_HTML);
    expect(blocks).toEqual([
      { type: 'paragraph', text: 'Build things.' },
      { type: 'paragraph', text: 'click' },
      { type: 'item', text: 'Ship quality' },
      { type: 'item', text: 'Mentor & review' },
    ]);
    const all = JSON.stringify(blocks);
    for (const bad of ['script', 'onerror', 'javascript:', 'iframe', 'display:none', '__pwned', '<'])
      expect(all).not.toContain(bad);
  });

  it('turns headings and list items into typed blocks and caps runaway input', () => {
    expect(htmlToBlocks('<h2>About</h2><p>Text</p>')).toEqual([
      { type: 'heading', text: 'About' },
      { type: 'paragraph', text: 'Text' },
    ]);
    expect(htmlToBlocks('<p>x</p>'.repeat(1000))).toHaveLength(400);
  });

  it('splits pasted text into paragraphs and bullet items', () => {
    expect(textToBlocks('First para\nstill first\n\n- bullet one\n\nLast')).toEqual([
      { type: 'paragraph', text: 'First para still first' },
      { type: 'item', text: 'bullet one' },
      { type: 'paragraph', text: 'Last' },
    ]);
  });
});

describe('fetch guard (SSRF)', () => {
  it.each([
    ['http://boards-api.greenhouse.io/v1/boards/x/jobs', 'Only https'],
    ['https://evil.example/v1', 'not an allowed job source'],
    ['https://127.0.0.1/', 'not an allowed job source'],
    ['https://localhost/', 'not an allowed job source'],
    ['https://169.254.169.254/latest/meta-data', 'not an allowed job source'],
    ['https://[::1]/', 'not an allowed job source'],
    [['https://user:pw', 'api.lever.co/v0/postings/x'].join('@'), 'credentials'],
    ['https://api.lever.co:8443/v0/postings/x', 'Non-standard ports'],
    ['https://api.lever.co.evil.example/v0', 'not an allowed job source'],
    ['file:///etc/passwd', 'Only https'],
  ])('refuses %s', (url, message) => {
    expect(() => assertAllowedUrl(url)).toThrow(message);
  });

  it('never follows redirects, even to another allowed host', async () => {
    const fetchImpl = fakeFetch({
      'api.lever.co': () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } }),
    });
    await expect(guardedGetJson('https://api.lever.co/v0/postings/x', { fetchImpl, ...noWait })).rejects.toThrow(
      'Refusing to follow a redirect',
    );
  });

  it('classifies 404, 429, 5xx, non-JSON and oversized responses', async () => {
    const kind = async (res: () => Response): Promise<string> => {
      try {
        await guardedGetJson('https://api.lever.co/v0/postings/x', {
          fetchImpl: fakeFetch({ 'api.lever.co': res }),
          ...noWait,
        });
        return 'ok';
      } catch (err) {
        return (err as SourceError).kind;
      }
    };
    expect(await kind(() => new Response('', { status: 404 }))).toBe('not_found');
    expect(await kind(() => new Response('', { status: 429 }))).toBe('rate_limited');
    expect(await kind(() => new Response('', { status: 503 }))).toBe('outage');
    expect(await kind(() => new Response('<html>', { status: 200 }))).toBe('schema');
    expect(
      await kind(() => new Response('[]', { status: 200, headers: { 'content-length': String(50 * 1024 * 1024) } })),
    ).toBe('schema');
  });

  it('reports network failures as outages', async () => {
    const fetchImpl = async (): Promise<Response> => {
      throw new TypeError('fetch failed');
    };
    await expect(guardedGetJson('https://api.lever.co/v0/postings/x', { fetchImpl, ...noWait })).rejects.toMatchObject({
      kind: 'outage',
    });
  });
});

describe('normalisation', () => {
  it('maps only explicit labels', () => {
    expect(remotePolicyFrom('Remote')).toBe('remote');
    expect(remotePolicyFrom('OnSite')).toBe('onsite');
    expect(remotePolicyFrom('Flexible')).toBe('unknown');
    expect(employmentTypeFrom('Full Time')).toBe('full_time');
    expect(employmentTypeFrom('Permanent')).toBe('unknown');
    expect(employmentTypeFrom('Short Term')).toBe('temporary');
    expect(salaryInterval('1 YEAR')).toBe('year');
    expect(salaryInterval('per-hour-wage')).toBe('hour');
    expect(salaryInterval('per sprint')).toBeNull();
  });

  it('stores salary only when currency, interval and an amount are all published', () => {
    expect(publishedSalary('usd', 100, 200, '1 YEAR')).toEqual({
      currency: 'USD',
      min: 100,
      max: 200,
      interval: 'year',
      source: 'structured',
    });
    expect(publishedSalary('USD', null, null, '1 YEAR')).toBeNull();
    expect(publishedSalary(null, 100, 200, '1 YEAR')).toBeNull();
    expect(publishedSalary('USD', 100, 200, 'whenever')).toBeNull();
  });
});

describe('adapters', () => {
  it('Greenhouse: decodes escaped HTML, reads workplace metadata, never invents salary or employment type', async () => {
    const fetchImpl = fakeFetch({
      'boards-api.greenhouse.io': greenhouseJobs([
        { id: 7, title: 'Synthetic SRE', workplace: 'Remote', content: XSS_HTML },
        { id: 8 },
      ]),
    });
    const [first, second] = await createAdapters(fetchImpl).greenhouse.list('synthetic');
    expect(fetchImpl.calls[0]).toBe('https://boards-api.greenhouse.io/v1/boards/synthetic/jobs?content=true');
    expect(first).toMatchObject({
      sourceJobId: '7',
      employer: 'Synthetic Labs',
      title: 'Synthetic SRE',
      remotePolicy: 'remote',
      employmentType: 'unknown',
      salary: null,
    });
    expect(JSON.stringify(first!.description)).not.toMatch(/script|onerror|javascript:|&lt;/);
    expect(first!.unresolved).toContain('Salary is not published in structured form.');
    expect(second!.remotePolicy).toBe('unknown');
  });

  it('Lever: maps workplace type and structured salary, drops non-http links', async () => {
    const fetchImpl = fakeFetch({
      'api.lever.co': leverPostings([
        { id: 'a', workplaceType: 'remote', salary: true },
        { id: 'b', applyUrl: 'javascript:alert(1)' },
      ]),
    });
    const [a, b] = await createAdapters(fetchImpl).lever.list('synthetic');
    expect(a).toMatchObject({
      remotePolicy: 'remote',
      employmentType: 'unknown',
      salary: { currency: 'EUR', min: 60000, max: 80000, interval: 'year' },
    });
    expect(a!.description.some((blk) => blk.type === 'heading' && blk.text === 'What you will do')).toBe(true);
    expect(b!.applyUrl).toBe('https://jobs.lever.co/synthetic/b');
  });

  it('Ashby: uses Salary components only, falls back to isRemote, skips unlisted jobs', async () => {
    const fetchImpl = fakeFetch({
      'api.ashbyhq.com': ashbyBoard([
        { id: 'x', salary: true },
        { id: 'y', workplaceType: null, isRemote: true, employmentType: 'Contract' },
        { id: 'z', isListed: false },
      ]),
    });
    const jobs = await createAdapters(fetchImpl).ashby.list('synthetic');
    expect(jobs.map((j) => j.sourceJobId)).toEqual(['x', 'y']);
    expect(jobs[0]).toMatchObject({
      employmentType: 'full_time',
      remotePolicy: 'hybrid',
      salary: { currency: 'USD', min: 150000, max: 200000, interval: 'year' },
    });
    expect(jobs[1]).toMatchObject({ employmentType: 'contract', remotePolicy: 'remote', salary: null });
  });

  it('rejects unexpected shapes and unsafe board names', async () => {
    const adapters = createAdapters(fakeFetch({ 'api.lever.co': { not: 'an array' } }));
    await expect(adapters.lever.list('synthetic')).rejects.toMatchObject({ kind: 'schema' });
    await expect(adapters.lever.list('../../admin')).rejects.toBeInstanceOf(SourceError);
  });
});

describe('board URLs', () => {
  it.each([
    ['https://job-boards.greenhouse.io/synthetic', { source: 'greenhouse', board: 'synthetic' }],
    ['https://boards.greenhouse.io/synthetic/jobs/123', { source: 'greenhouse', board: 'synthetic' }],
    ['https://boards.greenhouse.io/embed/job_board?for=synthetic', { source: 'greenhouse', board: 'synthetic' }],
    ['https://jobs.lever.co/synthetic/abc-123', { source: 'lever', board: 'synthetic' }],
    ['https://jobs.ashbyhq.com/synthetic', { source: 'ashby', board: 'synthetic' }],
  ])('recognises %s', async (url, expected) => {
    const { boardFromUrl } = await import('../../src/sources/board-url.js');
    expect(boardFromUrl(url)).toEqual(expected);
  });

  it.each(['https://careers.example.com/jobs', 'not a url', 'javascript:alert(1)', 'https://jobs.lever.co/'])(
    'rejects %s',
    async (url) => {
      const { boardFromUrl } = await import('../../src/sources/board-url.js');
      expect(boardFromUrl(url)).toBeNull();
    },
  );
});
