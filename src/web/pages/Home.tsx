import type { Overview } from '../api';
import { Link } from '../router';
import { useResource } from '../useResource';
import { ErrorPanel, Loading } from './states';

const dateFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function Home() {
  const overview = useResource<Overview>('/api/overview');

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">{dateFormat.format(new Date())}</p>
        <h1>Where things stand</h1>
      </div>
      {overview.state === 'loading' && <Loading label="Loading your overview" />}
      {overview.state === 'error' && <ErrorPanel message={overview.message} onRetry={overview.retry} />}
      {overview.state === 'ready' && (
        <div className="home-grid">
          <section aria-labelledby="nba-title" className="ledger">
            <h2 id="nba-title">Next best actions</h2>
            {overview.data.nextActions.length === 0 ? (
              <p className="empty">Nothing needs your attention right now.</p>
            ) : (
              <ol className="actions" data-testid="next-actions">
                {overview.data.nextActions.map((a, i) => (
                  <li key={a.rule} className="action" style={{ animationDelay: `${i * 70}ms` }}>
                    <span className="action__num" aria-hidden="true">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <h3>
                        <Link href={a.href}>{a.title}</Link>
                      </h3>
                      <p>{a.reason}</p>
                      <p className="rule">
                        <span className="visually-hidden">Why this is shown: rule </span>
                        {a.rule}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <aside className="status" aria-labelledby="status-title">
            <h2 id="status-title">System</h2>
            <dl>
              <div>
                <dt>Local service</dt>
                <dd>
                  <span className="dot dot--ok" aria-hidden="true" /> Running · v{overview.data.service.version}
                </dd>
              </div>
              {overview.data.service.startedAt && (
                <div>
                  <dt>Started</dt>
                  <dd>{timeFormat.format(new Date(overview.data.service.startedAt))}</dd>
                </div>
              )}
              <div>
                <dt>AI assistants</dt>
                <dd>
                  {overview.data.aiHosts.connected.length > 0
                    ? overview.data.aiHosts.connected.join(', ')
                    : 'None connected. Career Strike works fully without them.'}
                </dd>
              </div>
              <div>
                <dt>Your data</dt>
                <dd>Stored only on this computer.</dd>
              </div>
            </dl>
          </aside>
        </div>
      )}
    </>
  );
}
