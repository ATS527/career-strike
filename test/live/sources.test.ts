// Live checks against real public job boards (read-only GETs, one request per board).
// Run with: npm run test:live. The boards are large public employers chosen for stability; if one
// is retired the failure says so (not_found) rather than silently passing.
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getJob, JobQuery, listJobs, syncBoard } from '../../src/career/jobs.js';
import { createAdapters } from '../../src/sources/adapters.js';
import type { SourceId } from '../../src/sources/types.js';
import { openDb } from '../../src/store/db.js';
import { tempDir } from '../helpers.js';

const BOARDS: { source: SourceId; board: string; applyHost: RegExp }[] = [
  { source: 'greenhouse', board: 'airbnb', applyHost: /\.(airbnb\.com|greenhouse\.io)$/ },
  { source: 'lever', board: 'spotify', applyHost: /^jobs\.lever\.co$/ },
  { source: 'ashby', board: 'openai', applyHost: /^jobs\.ashbyhq\.com$/ },
];

const adapters = createAdapters();

describe.each(BOARDS)('$source live board $board', ({ source, board, applyHost }) => {
  it('returns genuine postings that verify into the local store', { timeout: 60_000 }, async () => {
    const postings = await adapters[source].list(board);
    expect(postings.length).toBeGreaterThan(0);
    for (const p of postings) {
      expect(p.sourceJobId).not.toBe('');
      expect(p.title.trim()).not.toBe('');
      expect(p.applyUrl, p.title).toMatch(/^https:\/\//);
      expect(new URL(p.applyUrl!).hostname).toMatch(applyHost);
      expect(JSON.stringify(p.description)).not.toMatch(/<script|<\/?[a-z]+[\s>]|&lt;/i);
    }

    const db = openDb(path.join(tempDir('cs-live-'), 'cs.db'));
    const result = syncBoard(db, source, board, postings);
    expect(result.added).toBe(new Set(postings.map((p) => p.sourceJobId)).size);
    const { jobs } = listJobs(db, JobQuery.parse({ status: 'OPEN', includeDuplicates: true, limit: 200 }), []);
    expect(jobs.length).toBeGreaterThan(0);
    const detail = getJob(db, jobs[0]!.id, [])!;
    expect(detail.sourceRecords[0]).toMatchObject({ source, board });
    expect(detail.lastVerifiedAt).not.toBeNull();
    console.log(`${source}/${board}: ${postings.length} postings, ${postings.filter((p) => p.salary).length} with published salary`);
  });
});
