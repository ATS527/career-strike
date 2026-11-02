import { useMemo, useState } from 'react';
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

interface BoardColumn {
  id: string;
  title: string;
  hint: string;
  states: ApplicationState[];
  accentColor: string;
}

const BOARD_COLUMNS: BoardColumn[] = [
  {
    id: 'review_and_drafts',
    title: 'Review & Drafts',
    hint: 'Applications needing your answers or approval',
    states: ['READY_FOR_REVIEW', 'DRAFTED', 'NEEDS_INFORMATION', 'BLOCKED'],
    accentColor: 'var(--ink-soft)',
  },
  {
    id: 'approved',
    title: 'Approved to Send',
    hint: 'Locked & verified packages ready for submission',
    states: ['APPROVED', 'NEEDS_MANUAL_ACTION'],
    accentColor: 'var(--accent)',
  },
  {
    id: 'submitted',
    title: 'Submitted',
    hint: 'Sent to employer; awaiting response',
    states: ['SUBMITTED_CONFIRMED', 'SUBMISSION_IN_PROGRESS', 'SUBMISSION_UNCONFIRMED', 'SUBMISSION_FAILED'],
    accentColor: 'var(--ink)',
  },
  {
    id: 'interviewing',
    title: 'Interviewing',
    hint: 'Active rounds and practice sessions',
    states: ['INTERVIEW', 'RESPONSE_RECEIVED'],
    accentColor: '#8a4baf',
  },
  {
    id: 'offers_and_closed',
    title: 'Closed & Offers',
    hint: 'Received offers or archived outcomes',
    states: ['OFFER', 'REJECTED', 'WITHDRAWN', 'CLOSED', 'EXPIRED', 'DUPLICATE', 'CANCELLED'],
    accentColor: 'var(--ink-faint)',
  },
];

export function Applications() {
  const res = useResource<{ applications: ApplicationSummary[] }>('/api/applications');
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
  const [searchQuery, setSearchQuery] = useState('');

  const applications = res.state === 'ready' ? res.data.applications : [];

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return applications;
    const q = searchQuery.toLowerCase();
    return applications.filter(
      (a) => a.title.toLowerCase().includes(q) || a.employer.toLowerCase().includes(q) || a.state.toLowerCase().includes(q),
    );
  }, [applications, searchQuery]);

  const counts = useMemo(() => {
    const toReview = applications.filter((a) => a.state === 'READY_FOR_REVIEW').length;
    const approved = applications.filter((a) => a.state === 'APPROVED').length;
    const submitted = applications.filter((a) => a.state === 'SUBMITTED_CONFIRMED').length;
    const interviewing = applications.filter((a) => a.state === 'INTERVIEW').length;
    const offers = applications.filter((a) => a.state === 'OFFER').length;
    return { total: applications.length, toReview, approved, submitted, interviewing, offers };
  }, [applications]);

  return (
    <>
      <div className="page-head page-head--row">
        <div>
          <p className="eyebrow">Candidate Pipeline</p>
          <h1>Application Workspace</h1>
          <p className="lede">
            Track every opportunity from initial draft to final offer. Applications never leave your computer without your explicit review and sign-off.
          </p>
        </div>
        <div className="view-toggle-bar">
          <button
            type="button"
            className={`button button--small ${viewMode === 'board' ? 'button--primary' : 'button--quiet'}`}
            onClick={() => setViewMode('board')}
            aria-pressed={viewMode === 'board'}
          >
            📊 Pipeline Board
          </button>
          <button
            type="button"
            className={`button button--small ${viewMode === 'list' ? 'button--primary' : 'button--quiet'}`}
            onClick={() => setViewMode('list')}
            aria-pressed={viewMode === 'list'}
          >
            📋 Grouped List
          </button>
        </div>
      </div>

      {res.state === 'loading' && <Loading label="Loading applications" />}
      {res.state === 'error' && <ErrorPanel message={res.message} onRetry={res.retry} />}

      {res.state === 'ready' && applications.length === 0 && (
        <p className="empty">
          No applications yet. Open a job from <Link href="/opportunities">Opportunities</Link> and choose “Prepare an application”.
        </p>
      )}

      {res.state === 'ready' && applications.length > 0 && (
        <>
          {/* Quick Metrics Bar */}
          <div className="pipeline-stats-strip" aria-label="Pipeline metrics">
            <div className="stat-pill">
              <span className="stat-pill__num">{counts.total}</span>
              <span className="stat-pill__label">Total Tracked</span>
            </div>
            {counts.toReview > 0 && (
              <div className="stat-pill stat-pill--highlight">
                <span className="stat-pill__num">{counts.toReview}</span>
                <span className="stat-pill__label">Need Review</span>
              </div>
            )}
            {counts.approved > 0 && (
              <div className="stat-pill">
                <span className="stat-pill__num">{counts.approved}</span>
                <span className="stat-pill__label">Ready to Submit</span>
              </div>
            )}
            <div className="stat-pill">
              <span className="stat-pill__num">{counts.submitted}</span>
              <span className="stat-pill__label">Submitted</span>
            </div>
            {counts.interviewing > 0 && (
              <div className="stat-pill stat-pill--accent">
                <span className="stat-pill__num">{counts.interviewing}</span>
                <span className="stat-pill__label">Interviewing</span>
              </div>
            )}
            {counts.offers > 0 && (
              <div className="stat-pill stat-pill--offer">
                <span className="stat-pill__num">{counts.offers}</span>
                <span className="stat-pill__label">Offers</span>
              </div>
            )}
          </div>

          {/* Search bar */}
          <div className="app-search-bar">
            <label htmlFor="app-search" className="visually-hidden">
              Search applications
            </label>
            <input
              id="app-search"
              type="search"
              placeholder="Filter applications by role, company, or state..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="app-search-input"
            />
            {searchQuery && (
              <button type="button" className="button button--small button--quiet" onClick={() => setSearchQuery('')}>
                Clear
              </button>
            )}
          </div>

          {viewMode === 'board' ? (
            /* Kanban Board View */
            <div className="pipeline-kanban" role="region" aria-label="Application Pipeline Board" tabIndex={0}>
              {BOARD_COLUMNS.map((col) => {
                const colItems = filtered.filter((a) => col.states.includes(a.state));
                return (
                  <section key={col.id} className="kanban-col" data-col={col.id} aria-labelledby={`col-head-${col.id}`}>
                    <div className="kanban-col__head" style={{ borderTopColor: col.accentColor }}>
                      <div className="kanban-col__title-row">
                        <h3 id={`col-head-${col.id}`}>{col.title}</h3>
                        <span className="kanban-col__count" aria-label={`${colItems.length} applications`}>
                          {colItems.length}
                        </span>
                      </div>
                      <p className="kanban-col__hint">{col.hint}</p>
                    </div>

                    <div className="kanban-col__cards">
                      {colItems.length === 0 ? (
                        <div className="kanban-empty">No items</div>
                      ) : (
                        colItems.map((a) => {
                          const daysSinceUpdate = Math.floor(
                            (Date.now() - new Date(a.updatedAt).getTime()) / (1000 * 3600 * 24),
                          );
                          const isStaleSubmitted = a.state === 'SUBMITTED_CONFIRMED' && daysSinceUpdate >= 7;

                          return (
                            <div key={a.id} className="kanban-card" data-application={a.id}>
                              <div className="kanban-card__top">
                                <span className="kanban-card__employer">{a.employer}</span>
                                <span className="kanban-card__state-badge">{APP_STATE_LABEL[a.state]}</span>
                              </div>
                              <h4 className="kanban-card__title">
                                <Link href={`/applications/${a.id}`}>{a.title}</Link>
                              </h4>
                              <div className="kanban-card__meta">
                                <span>Updated {ago(a.updatedAt)}</span>
                                {isStaleSubmitted && (
                                  <span className="stale-alert" title="No response recorded in 7+ days">
                                    ⚠️ Follow-up due ({daysSinceUpdate}d)
                                  </span>
                                )}
                              </div>
                              <div className="kanban-card__actions">
                                {a.state === 'READY_FOR_REVIEW' ? (
                                  <Link href={`/applications/${a.id}`} className="button button--small button--primary">
                                    Review Package
                                  </Link>
                                ) : a.state === 'APPROVED' ? (
                                  <Link href={`/applications/${a.id}`} className="button button--small button--secondary">
                                    Submit on Site
                                  </Link>
                                ) : a.state === 'INTERVIEW' ? (
                                  <Link href={`/applications/${a.id}/prep`} className="button button--small button--primary">
                                    🎯 Prep Interview
                                  </Link>
                                ) : (
                                  <Link href={`/applications/${a.id}`} className="button button--small button--quiet">
                                    Open
                                  </Link>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            /* Traditional Grouped List View */
            GROUPS.map((g) => {
              const items = filtered.filter((a) => g.states.includes(a.state));
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
                        <div className="job-row__aside">
                          {a.state === 'INTERVIEW' && (
                            <Link href={`/applications/${a.id}/prep`} className="button button--small">
                              Prep
                            </Link>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })
          )}
        </>
      )}
    </>
  );
}
