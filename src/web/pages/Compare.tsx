import { type ReactNode, useEffect, useState } from 'react';
import { api, type JobDetail } from '../api';
import { StatusChip } from '../components/jobBits';
import { EMPLOYMENT_LABEL, formatSalary, REMOTE_LABEL, SOURCE_LABEL } from '../format';
import { Link, useSearch } from '../router';
import { ErrorPanel, Loading } from './states';

export function Compare() {
  const ids = (new URLSearchParams(useSearch()).get('ids') ?? '').split(',').filter(Boolean).slice(0, 4);
  const key = ids.join(',');
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error' } | { status: 'ready'; jobs: JobDetail[] }>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    Promise.all(key.split(',').filter(Boolean).map((id) => api<{ job: JobDetail }>(`/api/jobs/${encodeURIComponent(id)}`).then((r) => r.job))).then(
      (jobs) => !cancelled && setState({ status: 'ready', jobs }),
      () => !cancelled && setState({ status: 'error' }),
    );
    return () => {
      cancelled = true;
    };
  }, [key, attempt]);

  const rows: [string, (j: JobDetail) => ReactNode][] = [
    ['Employer', (j) => j.employer],
    ['Status', (j) => <StatusChip status={j.status} lastVerifiedAt={j.lastVerifiedAt} />],
    ['Location', (j) => j.locationText ?? <span className="muted">Not stated</span>],
    ['Arrangement', (j) => (j.remotePolicy === 'unknown' ? <span className="muted">Not stated</span> : REMOTE_LABEL[j.remotePolicy])],
    ['Employment', (j) => (j.employmentType === 'unknown' ? <span className="muted">Not stated</span> : EMPLOYMENT_LABEL[j.employmentType])],
    ['Salary', (j) => formatSalary(j.salary) ?? <span className="muted">Not published</span>],
    ['Your decision', (j) => ({ none: 'Not reviewed', shortlisted: 'Shortlisted', excluded: 'Not for me' })[j.disposition]],
    ['Found on', (j) => j.sources.map((s) => SOURCE_LABEL[s] ?? s).join(', ')],
  ];

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">
          <Link href="/opportunities">Opportunities</Link> / Compare
        </p>
        <h1>Side by side</h1>
      </div>
      {ids.length < 2 && <p className="empty">Choose at least two opportunities to compare from the list.</p>}
      {ids.length >= 2 && state.status === 'loading' && <Loading label="Loading jobs" />}
      {ids.length >= 2 && state.status === 'error' && <ErrorPanel message="One of these jobs could not be loaded." onRetry={() => setAttempt((n) => n + 1)} />}
      {ids.length >= 2 && state.status === 'ready' && (
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Comparison table">
          <table className="compare">
            <thead>
              <tr>
                <td />
                {state.jobs.map((j) => (
                  <th key={j.id} scope="col">
                    <Link href={`/jobs/${j.id}`}>{j.title}</Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, cell]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  {state.jobs.map((j) => (
                    <td key={j.id}>{cell(j)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
