import { useMemo, useState } from 'react';
import type { ApplicationState, ApplicationSummary } from '../../api';
import { PageHeader } from '../../components/PageHeader';
import { ErrorPanel, Loading } from '../../components/states';
import { Button, buttonVariants } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { APP_STATE_LABEL, ago } from '../../format';
import { cn } from '../../helpers/cn';
import { useResource } from '../../hooks/useResource';
import { Link } from '../../router';
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
    <div>
      <PageHeader
        eyebrow="Application Tracking"
        title="Applications"
        lede="Every application is prepared, approved and recorded on this computer. Nothing is submitted without your confirmation."
        actions={
          <div
            className="flex gap-1 p-1 bg-muted/60 rounded-lg border border-border"
            role="group"
            aria-label="View Mode"
          >
            <Button
              type="button"
              variant={viewMode === 'board' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('board')}
              className="text-xs h-7"
            >
              Pipeline Board
            </Button>
            <Button
              type="button"
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className="text-xs h-7"
            >
              Grouped List
            </Button>
          </div>
        }
      />

      {res.state === 'loading' && <Loading label="Loading applications" />}
      {res.state === 'error' && <ErrorPanel message="Applications could not be loaded." onRetry={res.retry} />}
      {res.state === 'ready' && res.data.applications.length === 0 && (
        <p className="text-sm text-muted-foreground italic my-4">
          No applications yet. Find an opportunity you like and click <em>Prepare an application</em>.
        </p>
      )}

      {res.state === 'ready' && res.data.applications.length > 0 && (
        <>
          <div className="my-4 flex gap-2 max-w-md">
            <Input
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
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 my-6" aria-label="Application pipeline stages">
              {BOARD_COLUMNS.map((col) => {
                const colItems = filtered.filter((a) => col.states.includes(a.state));
                return (
                  <section
                    key={col.id}
                    className="bg-muted/40 p-3 rounded-xl border border-border"
                    aria-labelledby={`col-${col.id}`}
                  >
                    <div className="pb-2 mb-3 border-b border-border">
                      <div className="flex items-center justify-between">
                        <h3 id={`col-${col.id}`} className="font-semibold text-sm m-0 text-foreground">
                          {col.title}
                        </h3>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-background border border-border">
                          {colItems.length}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1 m-0">{col.hint}</p>
                    </div>

                    <div className="space-y-3 min-h-[120px]">
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
                <section
                  key={g.title}
                  className="mb-8 p-5 bg-card rounded-lg border border-border shadow-xs"
                  aria-labelledby={`grp-${g.states[0]}`}
                >
                  <h2 id={`grp-${g.states[0]}`} className="text-lg font-bold text-foreground mb-1">
                    {g.title} <span className="text-xs font-normal text-muted-foreground">({items.length})</span>
                  </h2>
                  {g.hint && <p className="text-xs text-muted-foreground mb-4">{g.hint}</p>}
                  <ul className="space-y-3 p-0 m-0 list-none">
                    {items.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center justify-between gap-4 p-4 rounded-lg border border-border bg-card shadow-xs"
                        data-application={a.id}
                      >
                        <div className="space-y-1 flex-1 min-w-0">
                          <h3 className="text-base font-semibold text-foreground m-0 truncate">
                            <Link href={`/applications/${a.id}`} className="hover:underline">
                              {a.title}
                            </Link>
                          </h3>
                          <p className="flex flex-wrap items-center gap-x-2.5 text-xs text-muted-foreground m-0">
                            <span className="font-medium text-foreground">{a.employer}</span>
                            <span>•</span>
                            <span>{APP_STATE_LABEL[a.state]}</span>
                            <span>•</span>
                            <span>
                              version {a.version} · updated {ago(a.updatedAt)}
                            </span>
                          </p>
                        </div>
                        <div className="shrink-0">
                          {a.state === 'INTERVIEW' && (
                            <Link
                              href={`/applications/${a.id}/prep`}
                              className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'h-7 text-xs px-2.5')}
                            >
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
    </div>
  );
}

export default Applications;
