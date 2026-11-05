import { useEffect, useState } from 'react';
import { ApiError, type ApplicationSummary, api, type JobDetail } from '../../api';
import { FitPanel, RequirementsPanel } from '../../components/FitPanel';
import { DispositionControls, StatusChip } from '../../components/jobBits';
import { ErrorPanel, Loading } from '../../components/states';
import { Button, buttonVariants } from '../../components/ui/button';
import { EMPLOYMENT_LABEL, formatDate, formatDateTime, formatSalary, REMOTE_LABEL, SOURCE_LABEL } from '../../format';
import { cn } from '../../helpers/cn';
import { useResource } from '../../hooks/useResource';
import { ExternalLink, Link, useNavigateTo } from '../../router';
import { Description } from './-components/Description';

export function JobPage({ id }: { id: string }) {
  const navigate = useNavigateTo();
  const res = useResource<{ job: JobDetail }>(`/api/jobs/${encodeURIComponent(id)}`);
  const [job, setJob] = useState<JobDetail | null>(null);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [prepareError, setPrepareError] = useState<string | null>(null);

  useEffect(() => {
    if (res.state === 'ready') setJob(res.data.job);
  }, [res]);

  useEffect(() => {
    api<{ applications: ApplicationSummary[] }>('/api/applications').then(
      (r) => setApplicationId(r.applications.find((a) => a.jobId === id)?.id ?? null),
      () => setApplicationId(null),
    );
  }, [id]);

  const prepare = async (): Promise<void> => {
    setPrepareError(null);
    try {
      const r = await api<{ application: { id: string } }>('/api/applications', {
        method: 'POST',
        body: { jobId: id },
      });
      navigate(`/applications/${r.application.id}`);
    } catch (err) {
      setPrepareError(
        err instanceof ApiError
          ? ((err.body as { message?: string } | null)?.message ?? 'Could not prepare an application.')
          : 'Could not prepare an application.',
      );
    }
  };

  if (res.state === 'loading') return <Loading label="Loading job" />;
  if (res.state === 'error')
    return <ErrorPanel message="This job could not be loaded. It may not exist." onRetry={res.retry} />;
  if (!job) return null;

  const salary = formatSalary(job.salary);
  const facts: [string, string | null][] = [
    ['Location', job.locationText],
    ['Arrangement', job.remotePolicy === 'unknown' ? null : REMOTE_LABEL[job.remotePolicy]],
    [
      'Employment',
      job.employmentType === 'unknown' ? null : (EMPLOYMENT_LABEL[job.employmentType] ?? job.employmentType),
    ],
    ['Salary', salary],
    ['Department', job.department],
    ['Published', job.publishedAt ? formatDate(job.publishedAt) : null],
  ];
  const fromPosting = job.status !== 'UNVERIFIED';

  return (
    <article className="space-y-6">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
          <Link href="/opportunities" className="hover:underline">
            Opportunities
          </Link>{' '}
          / {job.employer}
        </p>
        <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 pb-4 border-b border-border">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-bold font-serif text-foreground m-0">{job.title}</h1>
            <p className="text-lg font-medium text-foreground m-0">{job.employer}</p>
            <div className="pt-1">
              <StatusChip status={job.status} lastVerifiedAt={job.lastVerifiedAt} />
            </div>
          </div>
          <div className="flex flex-col gap-2 items-start md:items-end shrink-0">
            <DispositionControls
              jobId={job.id}
              title={job.title}
              disposition={job.disposition}
              onChange={(d) => setJob({ ...job, disposition: d })}
            />
            <div className="flex items-center gap-2 flex-wrap">
              {applicationId ? (
                <Link
                  href={`/applications/${applicationId}`}
                  className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'text-xs')}
                >
                  Open your application
                </Link>
              ) : (
                job.status !== 'CLOSED' && (
                  <Button type="button" size="sm" onClick={() => void prepare()}>
                    Prepare an application
                  </Button>
                )
              )}
              {job.applyUrl && job.status !== 'CLOSED' && (
                <ExternalLink
                  href={job.applyUrl}
                  className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'text-xs')}
                >
                  Open the official posting
                </ExternalLink>
              )}
            </div>
            {prepareError && (
              <p className="text-xs text-destructive m-0" role="alert">
                {prepareError}
              </p>
            )}
          </div>
        </header>
      </div>

      {job.status === 'STALE' && (
        <div
          className="p-3.5 rounded-lg border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 text-xs shadow-xs"
          role="note"
        >
          Career Strike has not been able to confirm this posting is still open recently. Check the employer’s site
          before spending time on it.
        </div>
      )}
      {job.status === 'CLOSED' && (
        <div
          className="p-3.5 rounded-lg border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 text-xs shadow-xs"
          role="note"
        >
          This posting was taken down by the employer{job.closedAt ? ` (noticed ${formatDateTime(job.closedAt)})` : ''}.
        </div>
      )}

      {job.fitDetail && <FitPanel fit={job.fitDetail} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        <section
          aria-labelledby="facts-title"
          className="p-5 bg-card rounded-lg border border-border shadow-xs space-y-4"
        >
          <div>
            <h2 id="facts-title" className="text-base font-bold text-foreground m-0">
              What the posting says
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {fromPosting
                ? 'Taken from the employer’s published posting.'
                : 'Entered by you; not checked against a job board.'}
            </p>
          </div>
          <dl className="space-y-2 text-xs">
            {facts.map(([label, value]) => (
              <div key={label} className="p-2 rounded bg-muted/20 border border-border/40">
                <dt className="font-semibold text-foreground">{label}</dt>
                <dd className="text-muted-foreground mt-0.5">{value ?? <span className="italic">Not stated</span>}</dd>
              </div>
            ))}
          </dl>
          {job.unresolved.length > 0 && (
            <div className="pt-2 border-t border-border space-y-1.5">
              <h3 className="text-xs font-semibold text-foreground m-0">Not stated or not verified</h3>
              <ul className="space-y-1 p-0 m-0 list-none text-xs text-muted-foreground">
                {job.unresolved.map((u) => (
                  <li key={u} className="p-1.5 rounded bg-muted/20 border border-border/40">
                    {u}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="pt-2 border-t border-border space-y-1.5">
            <h3 className="text-xs font-semibold text-foreground m-0">Where this was found</h3>
            <ul className="space-y-1.5 p-0 m-0 list-none text-xs text-muted-foreground">
              {job.sourceRecords.map((s) => (
                <li
                  key={`${s.source}:${s.board}:${s.sourceJobId}`}
                  className="p-1.5 rounded bg-muted/20 border border-border/40"
                >
                  <strong className="text-foreground">{SOURCE_LABEL[s.source] ?? s.source}</strong>
                  {s.source !== 'manual' && <> · board “{s.board}”</>} · seen {formatDateTime(s.fetchedAt)}
                  {s.url && (
                    <>
                      {' '}
                      ·{' '}
                      <ExternalLink href={s.url} className="text-primary hover:underline">
                        posting
                      </ExternalLink>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
          {job.duplicates.length > 0 && (
            <div className="pt-2 border-t border-border space-y-1.5">
              <h3 className="text-xs font-semibold text-foreground m-0">Also listed as</h3>
              <ul className="space-y-1.5 p-0 m-0 list-none text-xs text-muted-foreground">
                {job.duplicates.map((d) => (
                  <li key={d.id} className="p-1.5 rounded bg-muted/20 border border-border/40">
                    <Link href={`/jobs/${d.id}`} className="font-medium text-primary hover:underline">
                      {d.title}
                    </Link>{' '}
                    · {d.sources.map((s) => SOURCE_LABEL[s] ?? s).join(', ')}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <div className="lg:col-span-2 space-y-6">
          <RequirementsPanel req={job.requirements} />
          <section
            aria-labelledby="desc-title"
            className="p-5 bg-card rounded-lg border border-border shadow-xs space-y-3"
          >
            <h2 id="desc-title" className="text-lg font-bold text-foreground m-0">
              Posting
            </h2>
            {job.description.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No description was published.</p>
            ) : (
              <Description blocks={job.description} />
            )}
          </section>
        </div>
      </div>
    </article>
  );
}

export default JobPage;
