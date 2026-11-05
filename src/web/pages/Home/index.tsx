import type { Overview, ProfileReadinessReport } from '../../api';
import { PageHeader } from '../../components/PageHeader';
import { Badge } from '../../components/ui/badge';
import { ago } from '../../format';
import { Link } from '../../router';
import { useResource } from '../../useResource';
import { ErrorPanel, Loading } from '../states';
import { Count } from './-components/Count';

const dateFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function Home() {
  const overview = useResource<Overview>('/api/overview');
  const readiness = useResource<{ readiness: ProfileReadinessReport }>('/api/profile/readiness');

  return (
    <>
      <PageHeader eyebrow={dateFormat.format(new Date())} title="Where things stand" />
      {overview.state === 'loading' && <Loading label="Loading your overview" />}
      {overview.state === 'error' && <ErrorPanel message={overview.message} onRetry={overview.retry} />}
      {overview.state === 'ready' && (
        <>
          {readiness.state === 'ready' && (
            <section
              aria-labelledby="readiness-home-title"
              className="readiness-banner mb-6 p-4 bg-card border border-border rounded-xl"
            >
              <div className="flex justify-between items-center flex-wrap gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="secondary">{readiness.data.readiness.title}</Badge>
                    <span className="muted text-xs">
                      {readiness.data.readiness.counts.confirmedRoles} confirmed role
                      {readiness.data.readiness.counts.confirmedRoles === 1 ? '' : 's'} ·{' '}
                      {readiness.data.readiness.counts.confirmedSkills} confirmed skill
                      {readiness.data.readiness.counts.confirmedSkills === 1 ? '' : 's'}
                      {readiness.data.readiness.counts.totalUnconfirmed > 0 &&
                        ` · ${readiness.data.readiness.counts.totalUnconfirmed} unconfirmed`}
                    </span>
                  </div>
                  <p id="readiness-home-title" className="m-0 text-foreground">
                    {readiness.data.readiness.summary}
                  </p>
                </div>
                <Link href={readiness.data.readiness.actionHref} className="button button--secondary text-xs">
                  {readiness.data.readiness.actionLabel}
                </Link>
              </div>
            </section>
          )}

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

            <section aria-labelledby="pipeline-title" className="pipeline">
              <h2 id="pipeline-title">Your pipeline</h2>
              <dl className="counts" data-testid="pipeline">
                <Count
                  label="Verified open"
                  value={overview.data.jobs.open}
                  href="/opportunities?status=OPEN"
                  note="checked within 72 hours"
                />
                <Count
                  label="Not reviewed"
                  value={overview.data.jobs.unreviewed}
                  href="/opportunities?status=OPEN&disposition=none"
                />
                <Count
                  label="Shortlisted"
                  value={overview.data.jobs.shortlisted}
                  href="/opportunities?disposition=shortlisted"
                />
                <Count
                  label="May have closed"
                  value={overview.data.jobs.stale}
                  href="/opportunities?status=STALE"
                  note="not verified recently"
                />
                <Count
                  label="Added by you"
                  value={overview.data.jobs.unverified}
                  href="/opportunities?status=UNVERIFIED"
                  note="unverified"
                />
              </dl>
              <h3 className="pipeline__sub">Applications</h3>
              <dl className="counts" data-testid="application-counts">
                <Count label="To review" value={overview.data.applications.readyForReview} href="/applications" />
                <Count label="Approved, not sent" value={overview.data.applications.approved} href="/applications" />
                <Count
                  label="Submitted"
                  value={overview.data.applications.submitted}
                  href="/applications"
                  note="you confirmed"
                />
                <Count label="Interviewing" value={overview.data.applications.interviewing} href="/applications" />
                <Count label="Offers" value={overview.data.applications.offers} href="/applications" />
              </dl>
              {overview.data.interviews.length > 0 && (
                <>
                  <h3 className="pipeline__sub">Upcoming interviews</h3>
                  <ul className="disclosures" data-testid="upcoming-interviews">
                    {overview.data.interviews.map((i) => (
                      <li key={i.id}>
                        <Link href={`/applications/${i.applicationId}/prep`}>{i.stage}</Link> · {i.title} at{' '}
                        {i.employer} · {ago(i.scheduledAt)}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {overview.data.followUps.length > 0 && (
                <>
                  <h3 className="pipeline__sub">Upcoming follow-ups</h3>
                  <ul className="disclosures">
                    {overview.data.followUps.map((f) => (
                      <li key={f.id}>
                        <Link href={`/applications/${f.applicationId}`}>{f.note}</Link> · {f.title} at {f.employer} ·
                        due {ago(f.dueAt)}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            <aside className="status" aria-labelledby="status-title">
              <h2 id="status-title">Workspace &amp; Privacy</h2>
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
                  <dt>Job boards</dt>
                  <dd>
                    {overview.data.sources.boards === 0 ? (
                      <Link href="/opportunities/sources">None monitored yet</Link>
                    ) : (
                      <>
                        <Link href="/opportunities/sources">{overview.data.sources.boards} monitored</Link>
                        {overview.data.sources.failing > 0 && (
                          <span className="attention"> · {overview.data.sources.failing} failing</span>
                        )}
                        <br />
                        <span className="muted">
                          Last successful fetch {ago(overview.data.sources.lastSuccessfulDiscovery)}
                        </span>
                      </>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Running now</dt>
                  <dd data-testid="active-tasks">
                    {overview.data.activeTasks.length === 0
                      ? 'Nothing is running.'
                      : overview.data.activeTasks.map((t) => (
                          <span key={t.id} className="task-line">
                            {t.kind.startsWith('discover:') ? 'Fetching a job board' : t.kind} · started{' '}
                            {ago(t.startedAt ?? t.createdAt)}
                          </span>
                        ))}
                  </dd>
                </div>
                <div>
                  <dt>AI assistants</dt>
                  <dd>
                    {overview.data.aiHosts.connected.length > 0
                      ? `Active in the last 15 minutes: ${overview.data.aiHosts.connected.map(hostName).join(', ')}`
                      : overview.data.aiHosts.configured.length > 0
                        ? `Connected, not active recently: ${overview.data.aiHosts.configured.map(hostName).join(', ')}`
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
        </>
      )}
    </>
  );
}

function hostName(name: string): string {
  return (
    ({ codex: 'Codex', 'claude-code': 'Claude Code', opencode: 'OpenCode' } as Record<string, string>)[name] ?? name
  );
}

export default Home;
