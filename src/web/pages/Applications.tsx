import type { ApplicationState, ApplicationSummary } from '../api';
import { ago, APP_STATE_LABEL } from '../format';
import { Link } from '../router';
import { useResource } from '../useResource';
import { ErrorPanel, Loading } from './states';

const GROUPS: { title: string; hint: string; states: ApplicationState[] }[] = [
  { title: 'Ready for your review', hint: 'Check exactly what would be sent, then approve or reject.', states: ['READY_FOR_REVIEW'] },
  { title: 'Approved', hint: 'Approved packages waiting to be submitted on the employer’s site.', states: ['APPROVED', 'NEEDS_MANUAL_ACTION'] },
  { title: 'Drafts', hint: 'Finish the missing answers, then mark them ready.', states: ['DRAFTED', 'NEEDS_INFORMATION', 'BLOCKED'] },
  {
    title: 'Submitted and beyond',
    hint: '',
    states: ['SUBMISSION_IN_PROGRESS', 'SUBMITTED_CONFIRMED', 'SUBMISSION_UNCONFIRMED', 'SUBMISSION_FAILED', 'RESPONSE_RECEIVED', 'INTERVIEW', 'OFFER'],
  },
  { title: 'Closed', hint: '', states: ['REJECTED', 'WITHDRAWN', 'CLOSED', 'EXPIRED', 'DUPLICATE', 'CANCELLED'] },
];

export function Applications() {
  const res = useResource<{ applications: ApplicationSummary[] }>('/api/applications');
  return (
    <>
      <div className="page-head">
        <p className="eyebrow">Applications</p>
        <h1>Nothing leaves without you</h1>
        <p className="lede">Career Strike prepares applications from your approved profile. You review and approve each one, exactly as it would be sent.</p>
      </div>
      {res.state === 'loading' && <Loading label="Loading applications" />}
      {res.state === 'error' && <ErrorPanel message={res.message} onRetry={res.retry} />}
      {res.state === 'ready' && res.data.applications.length === 0 && (
        <p className="empty">
          No applications yet. Open a job from <Link href="/opportunities">Opportunities</Link> and choose “Prepare an application”.
        </p>
      )}
      {res.state === 'ready' &&
        GROUPS.map((g) => {
          const items = res.data.applications.filter((a) => g.states.includes(a.state));
          if (items.length === 0) return null;
          return (
            <section key={g.title} className="settings-group" aria-labelledby={`grp-${g.states[0]}`}>
              <h2 id={`grp-${g.states[0]}`}>
                {g.title} <span className="muted">({items.length})</span>
              </h2>
              {g.hint && <p className="help">{g.hint}</p>}
              <ul className="job-list app-list">
                {items.map((a) => (
                  <li key={a.id} className="job-row" data-application={a.id}>
                    <div className="job-row__main">
                      <h3 className="job-row__title">
                        <Link href={`/applications/${a.id}`}>{a.title}</Link>
                      </h3>
                      <p className="job-row__meta">
                        <span className="job-row__employer">{a.employer}</span>
                        <span>{APP_STATE_LABEL[a.state]}</span>
                        <span className="muted">
                          version {a.version} · updated {ago(a.updatedAt)}
                        </span>
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
    </>
  );
}
