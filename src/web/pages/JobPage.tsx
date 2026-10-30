import { type ReactElement, useEffect, useState } from 'react';
import type { JobDetail } from '../api';
import { DispositionControls, StatusChip } from '../components/jobBits';
import { EMPLOYMENT_LABEL, formatDate, formatDateTime, formatSalary, REMOTE_LABEL, SOURCE_LABEL } from '../format';
import { ExternalLink, Link } from '../router';
import { useResource } from '../useResource';
import { ErrorPanel, Loading } from './states';

export function JobPage({ id }: { id: string }) {
  const res = useResource<{ job: JobDetail }>(`/api/jobs/${encodeURIComponent(id)}`);
  const [job, setJob] = useState<JobDetail | null>(null);
  useEffect(() => {
    if (res.state === 'ready') setJob(res.data.job);
  }, [res]);

  if (res.state === 'loading') return <Loading label="Loading job" />;
  if (res.state === 'error') return <ErrorPanel message="This job could not be loaded. It may not exist." onRetry={res.retry} />;
  if (!job) return null;

  const salary = formatSalary(job.salary);
  const facts: [string, string | null][] = [
    ['Location', job.locationText],
    ['Arrangement', job.remotePolicy === 'unknown' ? null : REMOTE_LABEL[job.remotePolicy]],
    ['Employment', job.employmentType === 'unknown' ? null : (EMPLOYMENT_LABEL[job.employmentType] ?? job.employmentType)],
    ['Salary', salary],
    ['Department', job.department],
    ['Published', job.publishedAt ? formatDate(job.publishedAt) : null],
  ];
  const fromPosting = job.status !== 'UNVERIFIED';

  return (
    <article className="job">
      <p className="eyebrow">
        <Link href="/opportunities">Opportunities</Link> / {job.employer}
      </p>
      <header className="job__head">
        <div>
          <h1>{job.title}</h1>
          <p className="job__employer">{job.employer}</p>
          <p>
            <StatusChip status={job.status} lastVerifiedAt={job.lastVerifiedAt} />
          </p>
        </div>
        <div className="job__actions">
          <DispositionControls jobId={job.id} title={job.title} disposition={job.disposition} onChange={(d) => setJob({ ...job, disposition: d })} />
          {job.applyUrl && job.status !== 'CLOSED' && (
            <ExternalLink href={job.applyUrl} className="button">
              Open the official posting
            </ExternalLink>
          )}
        </div>
      </header>

      {job.status === 'STALE' && (
        <div className="banner banner--attention" role="note">
          Career Strike has not been able to confirm this posting is still open recently. Check the employer’s site before spending time on it.
        </div>
      )}
      {job.status === 'CLOSED' && (
        <div className="banner banner--attention" role="note">
          This posting was taken down by the employer{job.closedAt ? ` (noticed ${formatDateTime(job.closedAt)})` : ''}.
        </div>
      )}

      <div className="job__grid">
        <section aria-labelledby="facts-title" className="job__facts">
          <h2 id="facts-title">What the posting says</h2>
          <p className="provenance">{fromPosting ? 'Taken from the employer’s published posting.' : 'Entered by you; not checked against a job board.'}</p>
          <dl className="facts">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value ?? <span className="muted">Not stated</span>}</dd>
              </div>
            ))}
          </dl>
          {job.unresolved.length > 0 && (
            <>
              <h3>Not stated or not verified</h3>
              <ul className="unresolved">
                {job.unresolved.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </>
          )}
          <h3>Where this was found</h3>
          <ul className="sources">
            {job.sourceRecords.map((s) => (
              <li key={`${s.source}:${s.board}:${s.sourceJobId}`}>
                <strong>{SOURCE_LABEL[s.source] ?? s.source}</strong>
                {s.source !== 'manual' && <> · board “{s.board}”</>} · seen {formatDateTime(s.fetchedAt)}
                {s.url && (
                  <>
                    {' '}
                    · <ExternalLink href={s.url}>posting</ExternalLink>
                  </>
                )}
              </li>
            ))}
          </ul>
          {job.duplicates.length > 0 && (
            <>
              <h3>Also listed as</h3>
              <ul className="sources">
                {job.duplicates.map((d) => (
                  <li key={d.id}>
                    <Link href={`/jobs/${d.id}`}>{d.title}</Link> · {d.sources.map((s) => SOURCE_LABEL[s] ?? s).join(', ')}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section aria-labelledby="desc-title" className="job__description">
          <h2 id="desc-title">Posting</h2>
          {job.description.length === 0 ? (
            <p className="muted">No description was published.</p>
          ) : (
            <Description blocks={job.description} />
          )}
        </section>
      </div>
    </article>
  );
}

/** Posting text rendered strictly as text; consecutive items become one list. */
function Description({ blocks }: { blocks: JobDetail['description'] }) {
  const out: ReactElement[] = [];
  let items: string[] = [];
  const flushItems = (key: number): void => {
    if (items.length === 0) return;
    out.push(
      <ul key={`ul-${key}`}>
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>,
    );
    items = [];
  };
  blocks.forEach((b, i) => {
    if (b.type === 'item') {
      items.push(b.text);
      return;
    }
    flushItems(i);
    out.push(b.type === 'heading' ? <h3 key={i}>{b.text}</h3> : <p key={i}>{b.text}</p>);
  });
  flushItems(blocks.length);
  return <div className="prose">{out}</div>;
}
