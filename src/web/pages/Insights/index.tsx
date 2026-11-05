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
    <>
      <PageHeader
        eyebrow="Insights"
        title="What your search is telling you"
        lede={`Counted only from what you recorded. Every rate shows how many cases it rests on; with fewer than ${data.minSample}, Career Strike does not compare.`}
      />

      <section className="settings-group mb-6" aria-labelledby="obs-title">
        <h2 id="obs-title">Observations</h2>
        <ul className="disclosures" data-testid="observations">
          {data.observations.map((o) => (
            <li key={o.text}>{o.text}</li>
          ))}
        </ul>
      </section>

      <section className="settings-group mb-6" aria-labelledby="prop-title">
        <h2 id="prop-title">Suggestions</h2>
        <p className="help">
          Nothing changes unless you accept. Suggestions can only adjust monitoring, add a preferred role, or note a
          skill to learn.
        </p>
        <ProposalList proposals={open} onDecide={decide} />
        {message && (
          <p role="status" aria-live="polite" className="save-status mt-2">
            {message}
          </p>
        )}
      </section>

      <section className="settings-group mb-6" aria-labelledby="num-title">
        <h2 id="num-title">Your numbers</h2>
        <MetricSummaryCards metrics={m} />

        <h3 className="mt-4 mb-2">By source</h3>
        <BySourceTable bySource={m.bySource} />

        <h3 className="mt-4 mb-2">Discovery health</h3>
        <dl className="facts" data-testid="discovery-health">
          <div>
            <dt>Monitored boards</dt>
            <dd>{m.discoveryHealth.monitored}</dd>
          </div>
          <div>
            <dt>Healthy</dt>
            <dd>{m.discoveryHealth.healthy}</dd>
          </div>
          <div>
            <dt>Needs attention</dt>
            <dd>{m.discoveryHealth.degraded + m.discoveryHealth.notFound}</dd>
          </div>
          <div>
            <dt>Not yet fetched</dt>
            <dd>{m.discoveryHealth.neverRun}</dd>
          </div>
        </dl>

        {m.recurringGaps.length > 0 && (
          <>
            <h3 className="mt-4 mb-2">Skills you keep missing</h3>
            <ul className="disclosures">
              {m.recurringGaps.map((g) => (
                <li key={g.skill}>
                  {g.skill}: required in {g.jobs} job{g.jobs === 1 ? '' : 's'} you shortlisted or applied to
                </li>
              ))}
            </ul>
          </>
        )}

        <h3 className="mt-4 mb-2">Applications submitted per week</h3>
        <ul className="disclosures">
          {m.submittedPerWeek.map((w) => (
            <li key={w.weekStart}>
              Week of {formatDate(w.weekStart)}: {w.count}
            </li>
          ))}
        </ul>

        <h3 className="mt-4 mb-2">Weekly campaign summary</h3>
        <CampaignSummaryTable summaries={m.campaignSummaries} />
      </section>

      <section className="settings-group mb-6" aria-labelledby="hist-title">
        <h2 id="hist-title">History</h2>
        {decided.length > 0 && (
          <ul className="disclosures mb-4" data-testid="decided">
            {decided.map((p) => (
              <li key={p.id}>
                {p.status === 'ACCEPTED' ? 'Accepted' : 'Dismissed'} on {formatDate(p.decidedAt!)}: {p.title}
              </li>
            ))}
          </ul>
        )}
        <ul className="disclosures">
          {data.history.map((h) => (
            <li key={h.day}>
              {formatDate(h.day)}: {h.totals.submitted} submitted, {h.totals.responses} responses, {h.totals.interviews}{' '}
              interviews
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

export default Insights;
