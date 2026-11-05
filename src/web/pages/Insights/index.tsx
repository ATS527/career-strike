import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { PageHeader } from '../../components/PageHeader';
import { formatDate } from '../../format';
import { ErrorPanel, Loading } from '../states';
import { BySourceTable } from './-components/BySourceTable';
import { CampaignSummaryTable } from './-components/CampaignSummaryTable';
import { MetricSummaryCards } from './-components/MetricSummaryCards';
import { ProposalList } from './-components/ProposalList';
import type { Strategy } from './-helpers/rates';

export function Insights() {
  const [data, setData] = useState<Strategy | null>(null);
  const [error, setError] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<Strategy>('/api/strategy'));
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => void load(), [load]);

  if (error) return <ErrorPanel message="Insights could not be loaded." onRetry={() => void load()} />;
  if (!data) return <Loading label="Loading insights" />;

  const m = data.metrics;
  const open = data.proposals.filter((p) => p.status === 'OPEN');
  const decided = data.proposals.filter((p) => p.status !== 'OPEN');

  const decide = async (id: string, how: 'accept' | 'dismiss', title: string): Promise<void> => {
    try {
      await api(`/api/strategy/proposals/${id}/${how}`, { method: 'POST' });
      setMessage(how === 'accept' ? `Accepted: ${title}` : `Dismissed: ${title}`);
    } catch {
      setMessage('That did not work.');
    }
    void load();
  };

  return (
    <div>
      <PageHeader
        eyebrow="Insights"
        title="What your search is telling you"
        lede={`Counted only from what you recorded. Every rate shows how many cases it rests on; with fewer than ${data.minSample}, Career Strike does not compare.`}
      />

      <section
        className="mb-8 p-5 bg-card rounded-lg border border-border shadow-xs space-y-4"
        aria-labelledby="obs-title"
      >
        <h2 id="obs-title" className="text-lg font-bold text-foreground m-0">
          Observations
        </h2>
        <ul className="space-y-2 p-0 m-0 list-none text-sm text-muted-foreground" data-testid="observations">
          {data.observations.map((o) => (
            <li key={o.text} className="p-2.5 rounded bg-muted/30 border border-border/50 text-foreground">
              {o.text}
            </li>
          ))}
        </ul>
      </section>

      <section
        className="mb-8 p-5 bg-card rounded-lg border border-border shadow-xs space-y-4"
        aria-labelledby="prop-title"
      >
        <h2 id="prop-title" className="text-lg font-bold text-foreground m-0">
          Suggestions
        </h2>
        <p className="text-xs text-muted-foreground m-0">
          Nothing changes unless you accept. Suggestions can only adjust monitoring, add a preferred role, or note a
          skill to learn.
        </p>
        <ProposalList proposals={open} onDecide={decide} />
        {message && (
          <p role="status" aria-live="polite" className="text-xs text-muted-foreground mt-2">
            {message}
          </p>
        )}
      </section>

      <section
        className="mb-8 p-5 bg-card rounded-lg border border-border shadow-xs space-y-4"
        aria-labelledby="num-title"
      >
        <h2 id="num-title" className="text-lg font-bold text-foreground m-0">
          Your numbers
        </h2>
        <MetricSummaryCards metrics={m} />

        <h3 className="text-base font-semibold text-foreground pt-4 mb-2">By source</h3>
        <BySourceTable bySource={m.bySource} />

        <h3 className="text-base font-semibold text-foreground pt-4 mb-2">Discovery health</h3>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 p-0 m-0" data-testid="discovery-health">
          <div className="p-3.5 rounded-lg border border-border bg-card shadow-xs">
            <dt className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Monitored boards</dt>
            <dd className="text-xl font-bold font-serif text-foreground mt-1 m-0">{m.discoveryHealth.monitored}</dd>
          </div>
          <div className="p-3.5 rounded-lg border border-border bg-card shadow-xs">
            <dt className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Healthy</dt>
            <dd className="text-xl font-bold font-serif text-teal-600 dark:text-teal-400 mt-1 m-0">
              {m.discoveryHealth.healthy}
            </dd>
          </div>
          <div className="p-3.5 rounded-lg border border-border bg-card shadow-xs">
            <dt className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Needs attention</dt>
            <dd className="text-xl font-bold font-serif text-amber-600 dark:text-amber-400 mt-1 m-0">
              {m.discoveryHealth.degraded + m.discoveryHealth.notFound}
            </dd>
          </div>
          <div className="p-3.5 rounded-lg border border-border bg-card shadow-xs">
            <dt className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Not yet fetched</dt>
            <dd className="text-xl font-bold font-serif text-muted-foreground mt-1 m-0">
              {m.discoveryHealth.neverRun}
            </dd>
          </div>
        </dl>

        {m.recurringGaps.length > 0 && (
          <div className="pt-2">
            <h3 className="text-base font-semibold text-foreground mb-2">Skills you keep missing</h3>
            <ul className="space-y-1.5 p-0 m-0 list-none text-xs text-muted-foreground">
              {m.recurringGaps.map((g) => (
                <li key={g.skill} className="p-2 rounded bg-muted/30 border border-border/40">
                  <strong className="text-foreground">{g.skill}</strong>: required in {g.jobs} job
                  {g.jobs === 1 ? '' : 's'} you shortlisted or applied to
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="pt-2">
          <h3 className="text-base font-semibold text-foreground mb-2">Applications submitted per week</h3>
          <ul className="space-y-1.5 p-0 m-0 list-none text-xs text-muted-foreground">
            {m.submittedPerWeek.map((w) => (
              <li key={w.weekStart} className="p-2 rounded bg-muted/30 border border-border/40">
                Week of {formatDate(w.weekStart)}: <span className="font-semibold text-foreground">{w.count}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="pt-2">
          <h3 className="text-base font-semibold text-foreground mb-2">Weekly campaign summary</h3>
          <CampaignSummaryTable summaries={m.campaignSummaries} />
        </div>
      </section>

      <section
        className="mb-8 p-5 bg-card rounded-lg border border-border shadow-xs space-y-4"
        aria-labelledby="hist-title"
      >
        <h2 id="hist-title" className="text-lg font-bold text-foreground m-0">
          History
        </h2>
        {decided.length > 0 && (
          <ul className="space-y-1.5 p-0 m-0 list-none text-xs text-muted-foreground" data-testid="decided">
            {decided.map((p) => (
              <li key={p.id} className="p-2 rounded bg-muted/30 border border-border/40">
                <span className="font-medium text-foreground">
                  {p.status === 'ACCEPTED' ? 'Accepted' : 'Dismissed'}
                </span>{' '}
                on {formatDate(p.decidedAt!)}: {p.title}
              </li>
            ))}
          </ul>
        )}
        <ul className="space-y-1.5 p-0 m-0 list-none text-xs text-muted-foreground">
          {data.history.map((h) => (
            <li key={h.day} className="p-2 rounded bg-muted/30 border border-border/40">
              <span className="font-semibold text-foreground">{formatDate(h.day)}</span>: {h.totals.submitted}{' '}
              submitted, {h.totals.responses} responses, {h.totals.interviews} interviews
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default Insights;
