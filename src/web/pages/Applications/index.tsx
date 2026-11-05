import { useMemo, useState } from 'react';
import type { ApplicationState, ApplicationSummary } from '../../api';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/button';
import { APP_STATE_LABEL, ago } from '../../format';
import { Link } from '../../router';
import { useResource } from '../../useResource';
import { ErrorPanel, Loading } from '../states';
import { KanbanCard } from './-components/KanbanCard';

const GROUPS: { title: string; hint: string; states: ApplicationState[] }[] = [
  {
    title: 'Ready for your review',
    hint: 'Check exactly what would be sent, then approve or reject.',
    states: ['READY_FOR_REVIEW'],
  },
  {
    title: 'Approved',
    hint: 'Approved packages waiting to be submitted on the employer’s site.',
    states: ['APPROVED', 'NEEDS_MANUAL_ACTION'],
  },
  {
    title: 'Drafts',
    hint: 'Finish the missing answers, then mark them ready.',
    states: ['DRAFTED', 'NEEDS_INFORMATION', 'BLOCKED'],
  },
  {
    title: 'Submitted and beyond',
    hint: '',
    states: [
      'SUBMISSION_IN_PROGRESS',
      'SUBMITTED_CONFIRMED',
      'SUBMISSION_UNCONFIRMED',
      'SUBMISSION_FAILED',
      'RESPONSE_RECEIVED',
      'INTERVIEW',
      'OFFER',
    ],
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
    accentColor: 'var(--rule)',
  },
];

export function Applications() {
  const res = useResource<{ applications: ApplicationSummary[] }>('/api/applications');
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');

  const filtered = useMemo(() => {
    if (res.state !== 'ready') return [];
    const q = query.trim().toLowerCase();
    if (!q) return res.data.applications;
    return res.data.applications.filter(
      (a) => a.title.toLowerCase().includes(q) || a.employer.toLowerCase().includes(q),
    );
  }, [res, query]);

  return (
    <>
      <PageHeader
        eyebrow="Application Tracking"
        title="Applications"
        lede="Every application is prepared, approved and recorded on this computer. Nothing is submitted without your confirmation."
        actions={
          <div className="flex gap-1 choice-group" role="group" aria-label="View Mode">
            <Button
              type="button"
              variant={viewMode === 'board' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('board')}
            >
              Pipeline Board
            </Button>
            <Button
              type="button"
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
            >
              Grouped List
            </Button>
          </div>
        }
      />

      {res.state === 'loading' && <Loading label="Loading applications" />}
      {res.state === 'error' && <ErrorPanel message="Applications could not be loaded." onRetry={res.retry} />}
      {res.state === 'ready' && res.data.applications.length === 0 && (
        <p className="empty">
          No applications yet. Find an opportunity you like and click <em>Prepare an application</em>.
        </p>
      )}

      {res.state === 'ready' && res.data.applications.length > 0 && (
        <>
          <div className="search-bar my-4 flex gap-2">
            <input
              type="search"
              placeholder="Filter by title or employer…"
              aria-label="Filter applications"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1"
            />
            {query && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setQuery('')}>
                Clear
              </Button>
            )}
          </div>

          {viewMode === 'board' ? (
            <div
              className="kanban-board grid grid-cols-1 md:grid-cols-5 gap-4 my-6"
              aria-label="Application pipeline stages"
            >
              {BOARD_COLUMNS.map((col) => {
                const colItems = filtered.filter((a) => col.states.includes(a.state));
                return (
                  <section
                    key={col.id}
                    className="kanban-column bg-muted/40 p-3 rounded-xl border border-border"
                    aria-labelledby={`col-${col.id}`}
                  >
                    <div className="kanban-column__header pb-2 mb-3 border-b border-border">
                      <div className="flex items-center justify-between">
                        <h3 id={`col-${col.id}`} className="font-semibold text-sm">
                          {col.title}
                        </h3>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-background border border-border">
                          {colItems.length}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">{col.hint}</p>
                    </div>

                    <div className="kanban-column__cards space-y-3 min-h-[120px]">
                      {colItems.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic text-center py-6">None</p>
                      ) : (
                        colItems.map((a) => <KanbanCard key={a.id} application={a} />)
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            GROUPS.map((g) => {
              const items = filtered.filter((a) => g.states.includes(a.state));
              if (items.length === 0) return null;
              return (
                <section key={g.title} className="settings-group mb-6" aria-labelledby={`grp-${g.states[0]}`}>
                  <h2 id={`grp-${g.states[0]}`}>
                    {g.title} <span className="muted">({items.length})</span>
                  </h2>
                  {g.hint && <p className="help">{g.hint}</p>}
                  <ul className="job-list app-list space-y-3">
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

export default Applications;
