import { type FormEvent, useEffect, useState } from 'react';
import { api, type Disposition, type JobList, type JobSummary } from '../api';
import { DispositionControls, StatusChip } from '../components/jobBits';
import { EMPLOYMENT_LABEL, formatSalary, REMOTE_LABEL, SOURCE_LABEL } from '../format';
import { Link, navigate, useSearch } from '../router';
import { ErrorPanel, Loading } from './states';

const PAGE = 50;
const MAX_COMPARE = 4;

const FILTERS = {
  status: [
    ['active', 'Open or unverified'],
    ['OPEN', 'Verified open (last 72 h)'],
    ['STALE', 'May have closed'],
    ['UNVERIFIED', 'Added by you'],
    ['CLOSED', 'Closed'],
    ['all', 'Everything'],
  ],
  disposition: [
    ['not_excluded', 'Hide “not for me”'],
    ['none', 'Not reviewed yet'],
    ['shortlisted', 'Shortlisted'],
    ['excluded', 'Marked “not for me”'],
  ],
  remote: [
    ['', 'Any arrangement'],
    ['remote', 'Remote'],
    ['hybrid', 'Hybrid'],
    ['onsite', 'On-site'],
    ['unknown', 'Not stated'],
  ],
  source: [
    ['', 'Any source'],
    ['greenhouse', 'Greenhouse'],
    ['lever', 'Lever'],
    ['ashby', 'Ashby'],
    ['manual', 'Added by you'],
  ],
  sort: [
    ['newest', 'Newest first'],
    ['recently_verified', 'Recently verified'],
    ['employer', 'Employer A–Z'],
    ['title', 'Title A–Z'],
  ],
} as const;

type FilterKey = keyof typeof FILTERS;

export function Opportunities() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const [list, setList] = useState<{ state: 'loading' } | { state: 'error' } | { state: 'ready'; data: JobList }>({ state: 'loading' });
  const [limit, setLimit] = useState(PAGE);
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [compare, setCompare] = useState<string[]>([]);
  const [reload, setReload] = useState(0);
  // Filters start folded away on small screens so results are visible first.
  const [filtersOpen, setFiltersOpen] = useState(() => window.matchMedia('(min-width: 761px)').matches);
  const activeFilters = (Object.keys(FILTERS) as FilterKey[]).filter((k) => params.get(k)).length + (params.get('includeExcludedEmployers') ? 1 : 0);

  useEffect(() => setQuery(new URLSearchParams(search).get('q') ?? ''), [search]);

  useEffect(() => {
    let cancelled = false;
    const p = new URLSearchParams(search);
    p.set('limit', String(limit));
    for (const [k, v] of [...p.entries()]) if (v === '') p.delete(k);
    setList((l) => (l.state === 'ready' ? l : { state: 'loading' }));
    api<JobList>(`/api/jobs?${p.toString()}`).then(
      (data) => !cancelled && setList({ state: 'ready', data }),
      () => !cancelled && setList({ state: 'error' }),
    );
    return () => {
      cancelled = true;
    };
  }, [search, limit, reload]);

  const update = (key: string, value: string): void => {
    const p = new URLSearchParams(search);
    if (value) p.set(key, value);
    else p.delete(key);
    setLimit(PAGE);
    navigate(`/opportunities${p.toString() ? `?${p.toString()}` : ''}`, { replace: true });
  };

  const submitSearch = (e: FormEvent): void => {
    e.preventDefault();
    update('q', query.trim());
  };

  const toggleCompare = (id: string): void =>
    setCompare((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : ids.length < MAX_COMPARE ? [...ids, id] : ids));

  const onDisposition = (id: string, d: Disposition): void => {
    setList((l) => (l.state === 'ready' ? { state: 'ready', data: { ...l.data, jobs: l.data.jobs.map((j) => (j.id === id ? { ...j, disposition: d } : j)) } } : l));
  };

  return (
    <>
      <div className="page-head page-head--row">
        <div>
          <p className="eyebrow">Opportunities</p>
          <h1>Roles worth your time</h1>
        </div>
        <div className="page-actions">
          <Link href="/opportunities/sources" className="button button--quiet">
            Job boards
          </Link>
          <Link href="/opportunities/new" className="button">
            Add a job
          </Link>
        </div>
      </div>

      <form className="filters" role="search" onSubmit={submitSearch} aria-label="Search and filter opportunities">
        <div className="filters__search">
          <label htmlFor="q" className="visually-hidden">
            Search title, employer or description
          </label>
          <input id="q" type="search" value={query} placeholder="Search title, employer or description" onChange={(e) => setQuery(e.target.value)} />
          <button type="submit">Search</button>
        </div>
        <details className="filters__more" open={filtersOpen} onToggle={(e) => setFiltersOpen(e.currentTarget.open)}>
          <summary>
            Filters and sorting{activeFilters > 0 ? ` (${activeFilters} active)` : ''}
          </summary>
        <div className="filters__row">
          {(Object.keys(FILTERS) as FilterKey[]).map((key) => (
            <label key={key} className="filter">
              <span className="filter__label">{filterLabel(key)}</span>
              <select value={params.get(key) ?? FILTERS[key][0][0]} onChange={(e) => update(key, e.target.value === FILTERS[key][0][0] ? '' : e.target.value)}>
                {FILTERS[key].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label className="filter filter--check">
            <input
              type="checkbox"
              checked={params.get('includeExcludedEmployers') === 'true'}
              onChange={(e) => update('includeExcludedEmployers', e.target.checked ? 'true' : '')}
            />
            <span>Show excluded employers</span>
          </label>
        </div>
        </details>
      </form>

      {compare.length > 0 && (
        <div className="compare-bar" role="region" aria-label="Comparison">
          <span>
            {compare.length} of {MAX_COMPARE} selected for comparison
          </span>
          <Link href={`/opportunities/compare?ids=${compare.join(',')}`} className="button" aria-disabled={compare.length < 2}>
            Compare {compare.length < 2 ? '(pick at least 2)' : 'now'}
          </Link>
          <button type="button" className="quiet" onClick={() => setCompare([])}>
            Clear
          </button>
        </div>
      )}

      {list.state === 'loading' && <Loading label="Loading opportunities" />}
      {list.state === 'error' && <ErrorPanel message="Opportunities could not be loaded." onRetry={() => setReload((n) => n + 1)} />}
      {list.state === 'ready' && (
        <>
          <p className="result-count" role="status" aria-live="polite">
            {list.data.total === 0 ? 'No opportunities match.' : `${list.data.total} ${list.data.total === 1 ? 'opportunity' : 'opportunities'}`}
          </p>
          {list.data.total === 0 && <EmptyHint filtered={search.length > 1} />}
          <ul className="job-list" data-testid="job-list">
            {list.data.jobs.map((job) => (
              <JobRow
                key={job.id}
                job={job}
                selected={compare.includes(job.id)}
                compareFull={compare.length >= MAX_COMPARE}
                onCompare={() => toggleCompare(job.id)}
                onDisposition={(d) => onDisposition(job.id, d)}
              />
            ))}
          </ul>
          {list.data.jobs.length < list.data.total && (
            <button type="button" className="quiet more" onClick={() => setLimit((n) => n + PAGE)}>
              Show {Math.min(PAGE, list.data.total - list.data.jobs.length)} more
            </button>
          )}
        </>
      )}
    </>
  );
}

function filterLabel(key: FilterKey): string {
  return { status: 'Status', disposition: 'Your decision', remote: 'Arrangement', source: 'Source', sort: 'Sort' }[key];
}

function EmptyHint({ filtered }: { filtered: boolean }) {
  if (filtered) return <p className="empty">Try clearing a filter or searching for something broader.</p>;
  return (
    <p className="empty">
      Nothing here yet. <Link href="/opportunities/sources">Monitor a job board</Link> or <Link href="/opportunities/new">add a job you found</Link>.
    </p>
  );
}

function JobRow({
  job,
  selected,
  compareFull,
  onCompare,
  onDisposition,
}: {
  job: JobSummary;
  selected: boolean;
  compareFull: boolean;
  onCompare: () => void;
  onDisposition: (d: Disposition) => void;
}) {
  const salary = formatSalary(job.salary);
  return (
    <li className={`job-row job-row--${job.disposition}`}>
      <div className="job-row__main">
        <h2 className="job-row__title">
          <Link href={`/jobs/${job.id}`}>{job.title}</Link>
        </h2>
        <p className="job-row__meta">
          <span className="job-row__employer">{job.employer}</span>
          {job.locationText && <span>{job.locationText}</span>}
          <span>{REMOTE_LABEL[job.remotePolicy]}</span>
          {job.employmentType !== 'unknown' && <span>{EMPLOYMENT_LABEL[job.employmentType]}</span>}
          {salary && <span className="job-row__salary">{salary}</span>}
        </p>
        <p className="job-row__facts">
          <StatusChip status={job.status} lastVerifiedAt={job.lastVerifiedAt} />
          <span className="muted">{job.sources.map((s) => SOURCE_LABEL[s] ?? s).join(', ')}</span>
          {job.employerExcluded && <span className="badge">Excluded employer</span>}
        </p>
      </div>
      <div className="job-row__actions">
        <DispositionControls jobId={job.id} title={job.title} disposition={job.disposition} onChange={onDisposition} />
        <label className="compare-check">
          <input type="checkbox" checked={selected} disabled={!selected && compareFull} onChange={onCompare} />
          <span>
            Compare<span className="visually-hidden"> {job.title}</span>
          </span>
        </label>
      </div>
    </li>
  );
}
