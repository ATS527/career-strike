import type { Overview, ProfileReadinessReport } from '../../api';
import { PageHeader } from '../../components/PageHeader';
import { ErrorPanel, Loading } from '../../components/states';
import { Badge } from '../../components/ui/badge';
import { buttonVariants } from '../../components/ui/button';
import { ago } from '../../format';
import { cn } from '../../helpers/cn';
import { useResource } from '../../hooks/useResource';
import { Link } from '../../router';
import { Count } from './-components/Count';

const dateFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function Home() {
  const overview = useResource<Overview>('/api/overview');
  const readiness = useResource<{ readiness: ProfileReadinessReport }>('/api/profile/readiness');

  return (
    <div>
      <PageHeader eyebrow={dateFormat.format(new Date())} title="Where things stand" />
      {overview.state === 'loading' && <Loading label="Loading your overview" />}
      {overview.state === 'error' && <ErrorPanel message={overview.message} onRetry={overview.retry} />}
      {overview.state === 'ready' && (
        <>
          {readiness.state === 'ready' && (
            <section
              aria-labelledby="readiness-home-title"
              className="mb-6 p-4 bg-card border border-border rounded-xl shadow-xs"
            >
              <div className="flex justify-between items-center flex-wrap gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Badge variant="secondary">{readiness.data.readiness.title}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {readiness.data.readiness.counts.confirmedRoles} confirmed role
                      {readiness.data.readiness.counts.confirmedRoles === 1 ? '' : 's'} ·{' '}
                      {readiness.data.readiness.counts.confirmedSkills} confirmed skill
                      {readiness.data.readiness.counts.confirmedSkills === 1 ? '' : 's'}
                      {readiness.data.readiness.counts.totalUnconfirmed > 0 &&
                        ` · ${readiness.data.readiness.counts.totalUnconfirmed} unconfirmed`}
                    </span>
                  </div>
                  <p id="readiness-home-title" className="m-0 text-sm text-foreground">
                    {readiness.data.readiness.summary}
                  </p>
                </div>
                <Link
                  href={readiness.data.readiness.actionHref}
                  className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'text-xs')}
                >
                  {readiness.data.readiness.actionLabel}
                </Link>
              </div>
            </section>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <section
              aria-labelledby="nba-title"
              className="p-5 rounded-lg border border-border bg-card shadow-xs space-y-4"
            >
              <h2 id="nba-title" className="text-lg font-bold text-foreground m-0">
                Next best actions
              </h2>
              {overview.data.nextActions.length === 0 ? (
                <p className="text-sm text-muted-foreground italic my-2">Nothing needs your attention right now.</p>
              ) : (
                <ol className="space-y-3 p-0 m-0 list-none" data-testid="next-actions">
                  {overview.data.nextActions.map((a, i) => (
                    <li key={a.rule} className="flex gap-3 p-3 rounded-md bg-muted/30 border border-border/50">
                      <span
                        className="text-xs font-mono font-bold text-muted-foreground shrink-0 mt-0.5"
                        aria-hidden="true"
                      >
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div className="space-y-1">
                        <h3 className="text-sm font-semibold text-foreground m-0">
                          <Link href={a.href} className="hover:underline">
                            {a.title}
                          </Link>
                        </h3>
                        <p className="text-xs text-muted-foreground m-0 leading-relaxed">{a.reason}</p>
                        <p className="text-[11px] font-mono text-muted-foreground m-0">
                          <span className="sr-only">Why this is shown: rule </span>
                          {a.rule}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section
              aria-labelledby="pipeline-title"
              className="p-5 rounded-lg border border-border bg-card shadow-xs space-y-4"
            >
              <h2 id="pipeline-title" className="text-lg font-bold text-foreground m-0">
                Your pipeline
              </h2>
              <dl className="grid grid-cols-2 gap-3 p-0 m-0" data-testid="pipeline">
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
              <h3 className="text-sm font-semibold text-foreground mt-4 mb-2">Applications</h3>
              <dl className="grid grid-cols-2 gap-3 p-0 m-0" data-testid="application-counts">
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
                  <h3 className="text-sm font-semibold text-foreground mt-4 mb-2">Upcoming interviews</h3>
                  <ul
                    className="space-y-1.5 p-0 m-0 list-none text-xs text-muted-foreground"
                    data-testid="upcoming-interviews"
                  >
                    {overview.data.interviews.map((i) => (
                      <li key={i.id} className="p-2 rounded bg-muted/30 border border-border/40">
                        <Link
                          href={`/applications/${i.applicationId}/prep`}
                          className="font-semibold text-foreground hover:underline"
                        >
                          {i.stage}
                        </Link>{' '}
                        · {i.title} at {i.employer} · {ago(i.scheduledAt)}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {overview.data.followUps.length > 0 && (
                <>
                  <h3 className="text-sm font-semibold text-foreground mt-4 mb-2">Upcoming follow-ups</h3>
                  <ul className="space-y-1.5 p-0 m-0 list-none text-xs text-muted-foreground">
                    {overview.data.followUps.map((f) => (
                      <li key={f.id} className="p-2 rounded bg-muted/30 border border-border/40">
                        <Link
                          href={`/applications/${f.applicationId}`}
                          className="font-semibold text-foreground hover:underline"
                        >
                          {f.note}
                        </Link>{' '}
                        · {f.title} at {f.employer} · due {ago(f.dueAt)}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            <aside
              className="p-5 rounded-lg border border-border bg-card shadow-xs space-y-4"
              aria-labelledby="status-title"
            >
              <h2 id="status-title" className="text-lg font-bold text-foreground m-0">
                Workspace &amp; Privacy
              </h2>
              <dl className="space-y-3 text-xs m-0">
                <div className="space-y-0.5">
                  <dt className="text-muted-foreground font-semibold">Local service</dt>
                  <dd className="text-foreground flex items-center gap-1.5 m-0">
                    <span className="inline-block w-2 h-2 rounded-full bg-teal-500" aria-hidden="true" /> Running · v
                    {overview.data.service.version}
                  </dd>
                </div>
                {overview.data.service.startedAt && (
                  <div className="space-y-0.5">
                    <dt className="text-muted-foreground font-semibold">Started</dt>
                    <dd className="text-foreground m-0">
                      {timeFormat.format(new Date(overview.data.service.startedAt))}
                    </dd>
                  </div>
                )}
                <div className="space-y-0.5">
                  <dt className="text-muted-foreground font-semibold">Job boards</dt>
                  <dd className="text-foreground m-0">
                    {overview.data.sources.boards === 0 ? (
                      <Link href="/opportunities/sources" className="text-primary hover:underline">
                        None monitored yet
                      </Link>
                    ) : (
                      <>
                        <Link href="/opportunities/sources" className="text-primary hover:underline">
                          {overview.data.sources.boards} monitored
                        </Link>
                        {overview.data.sources.failing > 0 && (
                          <span className="text-amber-600 dark:text-amber-400 font-medium">
                            {' '}
                            · {overview.data.sources.failing} failing
                          </span>
                        )}
                        <br />
                        <span className="text-muted-foreground text-[11px]">
                          Last successful fetch {ago(overview.data.sources.lastSuccessfulDiscovery)}
                        </span>
                      </>
                    )}
                  </dd>
                </div>
                <div className="space-y-0.5">
                  <dt className="text-muted-foreground font-semibold">Running now</dt>
                  <dd className="text-foreground m-0" data-testid="active-tasks">
                    {overview.data.activeTasks.length === 0
                      ? 'Nothing is running.'
                      : overview.data.activeTasks.map((t) => (
                          <span key={t.id} className="block text-muted-foreground text-xs">
                            {t.kind.startsWith('discover:') ? 'Fetching a job board' : t.kind} · started{' '}
                            {ago(t.startedAt ?? t.createdAt)}
                          </span>
                        ))}
                  </dd>
                </div>
                <div className="space-y-0.5">
                  <dt className="text-muted-foreground font-semibold">AI assistants</dt>
                  <dd className="text-foreground m-0">
                    {overview.data.aiHosts.connected.length > 0
                      ? `Active in the last 15 minutes: ${overview.data.aiHosts.connected.map(hostName).join(', ')}`
                      : overview.data.aiHosts.configured.length > 0
                        ? `Connected, not active recently: ${overview.data.aiHosts.configured.map(hostName).join(', ')}`
                        : 'None connected. Career Strike works fully without them.'}
                  </dd>
                </div>
                <div className="space-y-0.5">
                  <dt className="text-muted-foreground font-semibold">Your data</dt>
                  <dd className="text-foreground m-0">Stored only on this computer.</dd>
                </div>
              </dl>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

function hostName(name: string): string {
  return (
    ({ codex: 'Codex', 'claude-code': 'Claude Code', opencode: 'OpenCode' } as Record<string, string>)[name] ?? name
  );
}

export default Home;
