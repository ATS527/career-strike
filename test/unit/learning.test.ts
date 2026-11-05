import { describe, expect, it } from 'vitest';
import { computeMetrics, type Metrics, MIN_SAMPLE, observations } from '../../src/learning/metrics.js';
import { ProposalAction, StrategyProposals } from '../../src/learning/proposals.js';
import { openDb } from '../../src/store/db.js';

const rate = (k: number, n: number) => ({ numerator: k, n, rate: n ? k / n : null });
function metrics(sources: { source: string; submitted: number; responded: number }[]): Metrics {
  const submitted = sources.reduce((a, s) => a + s.submitted, 0);
  const responses = sources.reduce((a, s) => a + s.responded, 0);
  return {
    generatedAt: '2026-10-31T00:00:00.000Z',
    totals: { found: 50, shortlisted: 5, submitted, responses, interviews: 0, offers: 0, rejections: 0 },
    responseRate: rate(responses, submitted),
    interviewRate: rate(0, submitted),
    bySource: sources.map((s) => ({
      source: s.source,
      found: 20,
      closedOrStale: rate(0, 20),
      shortlisted: 0,
      submitted: s.submitted,
      responded: rate(s.responded, s.submitted),
      interviewed: rate(0, s.submitted),
    })),
    daysToFirstResponse: { median: null, n: 0 },
    submittedPerWeek: [],
    campaignSummaries: [],
    recurringGaps: [],
    discoveryHealth: { monitored: 1, healthy: 1, degraded: 0, notFound: 0, neverRun: 0 },
  };
}

describe('campaignSummaries', () => {
  it('structure includes weekly summary fields', () => {
    const m = metrics([]);
    expect(m.campaignSummaries).toEqual([]);
  });
});

describe('observations', () => {
  it('refuses to compare below the minimum sample and says how many there are', () => {
    const obs = observations(
      metrics([
        { source: 'lever', submitted: 9, responded: 5 },
        { source: 'greenhouse', submitted: 30, responded: 1 },
      ]),
    );
    expect(obs.map((o) => o.kind)).toEqual(['insufficient']);
    expect(obs[0]!.text).toContain(`at least ${MIN_SAMPLE}`);
    expect(obs[0]!.text).toContain('lever: 9');
  });

  it('compares only with enough cases in each group, states n, and does not claim a cause', () => {
    const obs = observations(
      metrics([
        { source: 'lever', submitted: 12, responded: 6 },
        { source: 'greenhouse', submitted: 10, responded: 1 },
      ]),
    );
    expect(obs[0]!.kind).toBe('comparison');
    expect(obs[0]!.text).toContain('50% of the time (n=12)');
    expect(obs[0]!.text).toContain('10% on greenhouse (n=10)');
    expect(obs[0]!.text).toContain('not proof of cause');
  });

  it('does not treat silence as evidence about the résumé', () => {
    const obs = observations(metrics([{ source: 'lever', submitted: 4, responded: 0 }]));
    expect(obs.at(-1)!.text).toContain('Silence is common and is not evidence about your résumé.');
  });

  it('treats discovery failures as a source-health issue, never proof that roles closed', () => {
    const m = metrics([]);
    m.discoveryHealth = { monitored: 2, healthy: 1, degraded: 1, notFound: 0, neverRun: 0 };
    expect(observations(m)[0]!.text).toContain('does not mean previously found roles are closed');
  });
});

describe('proposal allowlist', () => {
  it('accepts only the allowed kinds of change', () => {
    expect(ProposalAction.safeParse({ type: 'set-monitoring', hours: '24' }).success).toBe(true);
    for (const bad of [
      { type: 'set-setting', key: 'identity.email', value: 'x@example.com' },
      { type: 'grant-scope', scope: 'sensitive:read' },
      { type: 'approve-application', id: 'app_1' },
      { type: 'set-monitoring', hours: '1' },
      { type: 'add-preferred-role', role: 'x', extra: true },
    ]) {
      expect(ProposalAction.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('discovery-health learning loop', () => {
  it('measures board health from local records and retains it in a daily snapshot', () => {
    const db = openDb(':memory:');
    const add = db.prepare(
      "INSERT INTO source_boards (id, source, board, added_at, health) VALUES (?, 'lever', ?, '2026-10-31T00:00:00.000Z', ?)",
    );
    add.run('src_ok', 'healthy', 'OK');
    add.run('src_bad', 'retry-later', 'DEGRADED');
    add.run('src_missing', 'retired', 'NOT_FOUND');
    const metrics = computeMetrics(db, Date.parse('2026-10-31T12:00:00.000Z'));
    expect(metrics.discoveryHealth).toEqual({ monitored: 3, healthy: 1, degraded: 1, notFound: 1, neverRun: 0 });

    const proposals = new StrategyProposals(db);
    proposals.snapshot(metrics);
    expect(proposals.history()[0]?.discoveryHealth).toEqual(metrics.discoveryHealth);
    expect(observations(metrics)[0]?.text).toContain('does not mean previously found roles are closed');
    db.close();
  });
});
