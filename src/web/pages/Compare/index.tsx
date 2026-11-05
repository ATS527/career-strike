import { useEffect, useState } from 'react';
import { api, type JobDetail } from '../../api';
import { PageHeader } from '../../components/PageHeader';
import { ErrorPanel, Loading } from '../../components/states';
import { Link, useSearch } from '../../router';
import { ComparisonTable } from './-components/ComparisonTable';

export function Compare() {
  const ids = (new URLSearchParams(useSearch()).get('ids') ?? '').split(',').filter(Boolean).slice(0, 4);
  const key = ids.join(',');
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'error' } | { status: 'ready'; jobs: JobDetail[] }
  >({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    Promise.all(
      key
        .split(',')
        .filter(Boolean)
        .map((id) => api<{ job: JobDetail }>(`/api/jobs/${encodeURIComponent(id)}`).then((r) => r.job)),
    ).then(
      (jobs) => !cancelled && setState({ status: 'ready', jobs }),
      () => !cancelled && setState({ status: 'error' }),
    );
    return () => {
      cancelled = true;
    };
  }, [key, attempt]);

  return (
    <>
      <PageHeader
        eyebrow={
          <span>
            <Link href="/opportunities">Opportunities</Link> / Compare
          </span>
        }
        title="Side by side"
      />
      {ids.length < 2 && (
        <p className="text-sm text-muted-foreground italic my-4">
          Choose at least two opportunities to compare from the list.
        </p>
      )}
      {ids.length >= 2 && state.status === 'loading' && <Loading label="Loading jobs" />}
      {ids.length >= 2 && state.status === 'error' && (
        <ErrorPanel message="One of these jobs could not be loaded." onRetry={() => setAttempt((n) => n + 1)} />
      )}
      {ids.length >= 2 && state.status === 'ready' && <ComparisonTable jobs={state.jobs} />}
    </>
  );
}

export default Compare;
