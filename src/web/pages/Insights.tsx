import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { formatDate, SOURCE_LABEL } from '../format';
import { ErrorPanel, Loading } from './states';

interface Rate {
  numerator: number;
  n: number;
  rate: number | null;
}
interface Strategy {
  minSample: number;
  metrics: {
    totals: { found: number; shortlisted: number; submitted: number; responses: number; interviews: number; offers: number; rejections: number };
    responseRate: Rate;
    interviewRate: Rate;
    bySource: { source: string; found: number; closedOrStale: Rate; shortlisted: number; submitted: number; responded: Rate; interviewed: Rate }[];
    daysToFirstResponse: { median: number | null; n: number };
    submittedPerWeek: { weekStart: string; count: number }[];
    recurringGaps: { skill: string; jobs: number }[];
  };
  observations: { kind: string; text: string }[];
  proposals: { id: string; title: string; rationale: string; status: 'OPEN' | 'ACCEPTED' | 'DISMISSED'; decidedAt: string | null; action: { type: string } }[];
  history: { day: string; totals: { submitted: number; responses: number; interviews: number } }[];
}

/** A rate is never shown without its sample size. */
function showRate(r: Rate): string {
  return r.n === 0 ? 'no data (n=0)' : `${r.numerator} of ${r.n} (${Math.round((r.rate ?? 0) * 100)}%)`;
}

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
      <div className="page-head">
        <p className="eyebrow">Insights</p>
        <h1>What your search is telling you</h1>
        <p className="lede">Counted only from what you recorded. Every rate shows how many cases it rests on; with fewer than {data.minSample}, Career Strike does not compare.</p>
      </div>

      <section className="settings-group" aria-labelledby="obs-title">
        <h2 id="obs-title">Observations</h2>
        <ul className="disclosures" data-testid="observations">
          {data.observations.map((o) => (
            <li key={o.text}>{o.text}</li>
          ))}
        </ul>
      </section>

      <section className="settings-group" aria-labelledby="prop-title">
        <h2 id="prop-title">Suggestions</h2>
        <p className="help">Nothing changes unless you accept. Suggestions can only adjust monitoring, add a preferred role, or note a skill to learn.</p>
        {open.length === 0 && <p className="empty">No suggestions right now.</p>}
        <ul className="topic-list" data-testid="proposals">
          {open.map((p) => (
            <li key={p.id} className="topic">
              <h3>{p.title}</h3>
              <p className="help">{p.rationale}</p>
              <div className="field__actions">
                <button type="button" onClick={() => void decide(p.id, 'accept', p.title)}>
                  Accept<span className="visually-hidden"> {p.title}</span>
                </button>
                <button type="button" className="quiet" onClick={() => void decide(p.id, 'dismiss', p.title)}>
                  Dismiss<span className="visually-hidden"> {p.title}</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
        <p role="status" aria-live="polite" className="save-status">
          {message}
        </p>
      </section>

      <section className="settings-group" aria-labelledby="num-title">
        <h2 id="num-title">Your numbers</h2>
        <dl className="facts" data-testid="totals">
          <div>
            <dt>Applications submitted</dt>
            <dd>{m.totals.submitted}</dd>
          </div>
          <div>
            <dt>Got a response</dt>
            <dd>{showRate(m.responseRate)}</dd>
          </div>
          <div>
            <dt>Reached interview</dt>
            <dd>{showRate(m.interviewRate)}</dd>
          </div>
          <div>
            <dt>Days to first response</dt>
            <dd>{m.daysToFirstResponse.median === null ? 'no data (n=0)' : `median ${m.daysToFirstResponse.median.toFixed(1)} (n=${m.daysToFirstResponse.n})`}</dd>
          </div>
          <div>
            <dt>Offers</dt>
            <dd>{m.totals.offers}</dd>
          </div>
        </dl>
        <h3>By source</h3>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Results by source">
          <table className="compare" data-testid="by-source">
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">Found</th>
                <th scope="col">Closed or stale</th>
                <th scope="col">Submitted</th>
                <th scope="col">Responses</th>
              </tr>
            </thead>
            <tbody>
              {m.bySource.map((s) => (
                <tr key={s.source}>
                  <th scope="row">{SOURCE_LABEL[s.source] ?? s.source}</th>
                  <td>{s.found}</td>
                  <td>{showRate(s.closedOrStale)}</td>
                  <td>{s.submitted}</td>
                  <td>{showRate(s.responded)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {m.recurringGaps.length > 0 && (
          <>
            <h3>Skills you keep missing</h3>
            <ul className="disclosures">
              {m.recurringGaps.map((g) => (
                <li key={g.skill}>
                  {g.skill}: required in {g.jobs} job{g.jobs === 1 ? '' : 's'} you shortlisted or applied to
                </li>
              ))}
            </ul>
          </>
        )}
        <h3>Applications submitted per week</h3>
        <ul className="disclosures">
          {m.submittedPerWeek.map((w) => (
            <li key={w.weekStart}>
              Week of {formatDate(w.weekStart)}: {w.count}
            </li>
          ))}
        </ul>
      </section>

      <section className="settings-group" aria-labelledby="hist-title">
        <h2 id="hist-title">History</h2>
        {decided.length > 0 && (
          <ul className="disclosures" data-testid="decided">
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
              {formatDate(h.day)}: {h.totals.submitted} submitted, {h.totals.responses} responses, {h.totals.interviews} interviews
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
