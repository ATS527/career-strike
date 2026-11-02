import { type FormEvent, useEffect, useState } from 'react';
import { api, type Disposition, type JobList, type JobSummary, type SettingsResponse } from '../api';
import { TierChip } from '../components/FitPanel';
import { DispositionControls, StatusChip } from '../components/jobBits';
import { EMPLOYMENT_LABEL, formatSalary, REMOTE_LABEL, SOURCE_LABEL } from '../format';
import { Link, useNavigateTo, useSearch } from '../router';
import { ErrorPanel, Loading } from './states';
import { useResource } from '../useResource';
import { COUNTRY_CODES, COUNTRY_REGISTRY } from '../../markets/countries';
import { GERMANY_SOURCE_ASSESSMENTS, officialGermanySearchUrl } from '../../markets/germany-sources';
import { INDIA_SOURCE_ASSESSMENTS, officialIndiaSearchUrl } from '../../markets/india-sources';
import { SINGAPORE_SOURCE_ASSESSMENTS, officialSingaporeSearchUrl } from '../../markets/singapore-sources';
import { UAE_SOURCE_ASSESSMENTS, officialUaeSearchUrl } from '../../markets/uae-sources';
import { JAPAN_SOURCE_ASSESSMENTS, officialJapanSearchUrl } from '../../markets/japan-sources';
import { UK_SOURCE_ASSESSMENTS, officialUkSearchUrl } from '../../markets/uk-sources';
import { AUSTRALIA_SOURCE_ASSESSMENTS, officialAustraliaSearchUrl } from '../../markets/australia-sources';
import { CANADA_SOURCE_ASSESSMENTS, officialCanadaSearchUrl } from '../../markets/canada-sources';

const PAGE = 50;
const MAX_COMPARE = 4;
const COUNTRY_FILTERS: readonly (readonly [string, string])[] = [['', 'All markets'], ...COUNTRY_CODES.map((code) => [code, COUNTRY_REGISTRY[code].name] as const)];

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
  country: COUNTRY_FILTERS,
  source: [
    ['', 'Any source'],
    ['greenhouse', 'Greenhouse'],
    ['lever', 'Lever'],
    ['ashby', 'Ashby'],
    ['manual', 'Added by you'],
  ],
  tier: [
    ['', 'Any fit'],
    ['strong', 'Strong fit'],
    ['possible', 'Possible fit'],
    ['stretch', 'Stretch'],
    ['eligible', 'Hide “not eligible”'],
    ['ineligible', 'Not eligible'],
  ],
  sort: [
    ['newest', 'Newest first'],
    ['best_fit', 'Best fit'],
    ['recently_verified', 'Recently verified'],
    ['employer', 'Employer A–Z'],
    ['title', 'Title A–Z'],
  ],
} as const;

type FilterKey = keyof typeof FILTERS;

export function Opportunities() {
  const navigate = useNavigateTo();
  const search = useSearch();
  const settings = useResource<SettingsResponse>('/api/settings');
  const params = new URLSearchParams(search);
  const [list, setList] = useState<{ state: 'loading' } | { state: 'error' } | { state: 'ready'; data: JobList }>({ state: 'loading' });
  const [limit, setLimit] = useState(PAGE);
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [compare, setCompare] = useState<string[]>([]);
  const [reload, setReload] = useState(0);
  // Filters start folded away on small screens so results are visible first.
  const [filtersOpen, setFiltersOpen] = useState(() => window.matchMedia('(min-width: 761px)').matches);
  const activeFilters =
    (Object.keys(FILTERS) as FilterKey[]).filter((k) => params.get(k)).length +
    (params.get('city') ? 1 : 0) +
    (params.get('includeExcludedEmployers') ? 1 : 0) +
    (params.get('immediateStart') ? 1 : 0);

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
    if (key === 'country') p.delete('city');
    if (value) p.set(key, value);
    else p.delete(key);
    setLimit(PAGE);
    navigate(`/opportunities${p.toString() ? `?${p.toString()}` : ''}`, { replace: true });
  };

  const submitSearch = (e: FormEvent): void => {
    e.preventDefault();
    update('q', query.trim());
  };

  const applyPreset = (patch: Record<string, string | null>): void => {
    const p = new URLSearchParams(search);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') {
        p.delete(k);
      } else {
        p.set(k, v);
      }
    }
    if (patch.country !== undefined) p.delete('city');
    setLimit(PAGE);
    navigate(`/opportunities${p.toString() ? `?${p.toString()}` : ''}`, { replace: true });
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

      {settings.state === 'ready' && <CountryFocusViews countries={configuredCountries(settings.data.settings['search.preferredCountries'])} />}

      <div className="quick-presets-strip" role="region" aria-label="Quick focus filters">
        <span className="quick-presets__label">⚡ Focus:</span>
        <button
          type="button"
          className={`preset-chip ${!params.get('tier') && !params.get('remote') && !params.get('status') && !params.get('country') ? 'preset-chip--active' : ''}`}
          onClick={() => applyPreset({ tier: null, remote: null, status: null, country: null, sort: null })}
        >
          All
        </button>
        <button
          type="button"
          className={`preset-chip ${params.get('tier') === 'strong' ? 'preset-chip--active' : ''}`}
          onClick={() => applyPreset({ tier: 'strong', sort: 'best_fit' })}
        >
          ⭐ Strong Fit
        </button>
        <button
          type="button"
          className={`preset-chip ${params.get('remote') === 'remote' ? 'preset-chip--active' : ''}`}
          onClick={() => applyPreset({ remote: 'remote' })}
        >
          🌐 Remote
        </button>
        <button
          type="button"
          className={`preset-chip ${params.get('status') === 'OPEN' ? 'preset-chip--active' : ''}`}
          onClick={() => applyPreset({ status: 'OPEN', sort: 'newest' })}
        >
          ⏱️ Verified (&lt; 72h)
        </button>
        <button
          type="button"
          className={`preset-chip ${params.get('country') === 'DE' ? 'preset-chip--active' : ''}`}
          onClick={() => applyPreset({ country: 'DE' })}
        >
          🇩🇪 Germany
        </button>
        <button
          type="button"
          className={`preset-chip ${params.get('country') === 'IN' ? 'preset-chip--active' : ''}`}
          onClick={() => applyPreset({ country: 'IN' })}
        >
          🇮🇳 India
        </button>
        <button
          type="button"
          className={`preset-chip ${params.get('country') === 'SG' ? 'preset-chip--active' : ''}`}
          onClick={() => applyPreset({ country: 'SG' })}
        >
          🇸🇬 Singapore
        </button>
        <button
          type="button"
          className={`preset-chip ${params.get('country') === 'GB' ? 'preset-chip--active' : ''}`}
          onClick={() => applyPreset({ country: 'GB' })}
        >
          🇬🇧 UK
        </button>
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
            <div key={key} className="filter">
              {/* Explicit association: a wrapping label would make the option texts part of the name. */}
              <label htmlFor={`filter-${key}`} className="filter__label">
                {filterLabel(key)}
              </label>
              <select
                id={`filter-${key}`}
                value={params.get(key) ?? FILTERS[key][0][0]}
                onChange={(e) => update(key, e.target.value === FILTERS[key][0][0] ? '' : e.target.value)}
              >
                {FILTERS[key].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          ))}
          {params.get('country') && (
            <div className="filter">
              <label htmlFor="filter-city" className="filter__label">City</label>
              <select id="filter-city" value={params.get('city') ?? ''} onChange={(e) => update('city', e.target.value)}>
                <option value="">All cities</option>
                {COUNTRY_REGISTRY[params.get('country') as keyof typeof COUNTRY_REGISTRY].defaultCities.map((city) => <option key={city} value={city}>{city}</option>)}
              </select>
            </div>
          )}
          <label className="filter filter--check">
            <input type="checkbox" checked={params.get('immediateStart') === 'true'} onChange={(e) => update('immediateStart', e.target.checked ? 'true' : '')} />
            <span>Asks for an early start</span>
          </label>
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

      {params.get('country') === 'DE' && (
        <OfficialSearches
          id="germany-official-searches"
          market="Germany"
          sources={GERMANY_SOURCE_ASSESSMENTS}
          urlFor={officialGermanySearchUrl}
          query={query}
        />
      )}
      {params.get('country') === 'IN' && (
        <OfficialSearches
          id="india-official-searches"
          market="India"
          sources={INDIA_SOURCE_ASSESSMENTS}
          urlFor={officialIndiaSearchUrl}
          query={query}
        />
      )}
      {params.get('country') === 'SG' && (
        <OfficialSearches
          id="singapore-official-searches"
          market="Singapore"
          sources={SINGAPORE_SOURCE_ASSESSMENTS}
          urlFor={officialSingaporeSearchUrl}
          query={query}
        />
      )}
      {params.get('country') === 'AE' && (
        <OfficialSearches
          id="uae-official-searches"
          market="United Arab Emirates"
          sources={UAE_SOURCE_ASSESSMENTS}
          urlFor={officialUaeSearchUrl}
          query={query}
        />
      )}
      {params.get('country') === 'JP' && (
        <OfficialSearches
          id="japan-official-searches"
          market="Japan"
          sources={JAPAN_SOURCE_ASSESSMENTS}
          urlFor={officialJapanSearchUrl}
          query={query}
        />
      )}
      {params.get('country') === 'GB' && (
        <OfficialSearches
          id="uk-official-searches"
          market="United Kingdom"
          sources={UK_SOURCE_ASSESSMENTS}
          urlFor={officialUkSearchUrl}
          query={query}
        />
      )}
      {params.get('country') === 'AU' && (
        <OfficialSearches
          id="australia-official-searches"
          market="Australia"
          sources={AUSTRALIA_SOURCE_ASSESSMENTS}
          urlFor={officialAustraliaSearchUrl}
          query={query}
        />
      )}
      {params.get('country') === 'CA' && (
        <OfficialSearches
          id="canada-official-searches"
          market="Canada"
          sources={CANADA_SOURCE_ASSESSMENTS}
          urlFor={officialCanadaSearchUrl}
          query={query}
        />
      )}

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
          <TopMatchSpotlight jobs={list.data.jobs} />
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

function configuredCountries(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((code): code is string => typeof code === 'string' && code in COUNTRY_REGISTRY))];
}

/** Quick links are derived from local preferences; they do not claim a market has live sources. */
function CountryFocusViews({ countries }: { countries: string[] }) {
  if (countries.length === 0) return null;
  return (
    <nav className="country-focus" aria-label="Your country views">
      <span className="country-focus__label">Your markets</span>
      {countries.map((code) => (
        <Link key={code} href={`/opportunities?country=${encodeURIComponent(code)}&sort=best_fit`} className="country-focus__link">
          {COUNTRY_REGISTRY[code as keyof typeof COUNTRY_REGISTRY].name} best matches
        </Link>
      ))}
      <Link href="/settings" className="country-focus__link country-focus__link--quiet">
        Edit markets
      </Link>
    </nav>
  );
}

/** Official-site launchers are user-driven discovery; they never claim a market has live sources. */
function OfficialSearches<M extends { id: string; name: string; capability: string }>({
  id, market, sources, urlFor, query,
}: {
  id: string;
  market: string;
  sources: readonly M[];
  urlFor: (source: M, query: string) => string;
  query: string;
}) {
  return (
    <section className="external-discovery" aria-labelledby={id}>
      <div>
        <p className="eyebrow">{market} · user-driven discovery</p>
        <h2 id={id}>Search official job sites</h2>
        <p>
          These links open each provider’s own site. Career Strike does not retrieve, store or claim the listings as verified. After checking the employer’s official posting, <Link href="/opportunities/new">add it here</Link> to track it locally.
        </p>
      </div>
      <ul className="external-discovery__list">
        {sources.map((source) => (
          <li key={source.id}>
            <a href={urlFor(source, query)} target="_blank" rel="noopener noreferrer">
              {source.name} <span aria-hidden="true">↗</span>
            </a>
            <span>{source.capability === 'USER_DRIVEN_DISCOVERY' ? 'Search on the official site' : source.capability === 'RESTRICTED' ? 'Official site only — no automation' : 'No automatic retrieval'}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function filterLabel(key: FilterKey): string {
  return { status: 'Status', disposition: 'Your decision', remote: 'Arrangement', country: 'Market', source: 'Source', tier: 'Fit', sort: 'Sort' }[key];
}

function EmptyHint({ filtered }: { filtered: boolean }) {
  if (filtered) return <p className="empty">Try clearing a filter or searching for something broader.</p>;
  return (
    <p className="empty">
      Nothing here yet. <Link href="/opportunities/sources">Monitor a job board</Link> or <Link href="/opportunities/new">add a job you found</Link>.
    </p>
  );
}

function TopMatchSpotlight({ jobs }: { jobs: JobSummary[] }) {
  const topMatch = jobs.find((j) => j.fit?.tier === 'strong' && j.disposition !== 'excluded');
  if (!topMatch) return null;

  return (
    <aside className="top-match-card" aria-label="Top match recommendation">
      <div className="top-match-card__badge">⭐ High-Signal Match for Your Profile</div>
      <div className="top-match-card__content">
        <div className="top-match-card__details">
          <h3 className="top-match-card__title">
            <Link href={`/jobs/${topMatch.id}`}>{topMatch.title}</Link>
          </h3>
          <p className="top-match-card__meta">
            <strong>{topMatch.employer}</strong> · {topMatch.locationText || 'Location unstated'} ·{' '}
            <span>{REMOTE_LABEL[topMatch.remotePolicy]}</span>
            {topMatch.salary && ` · ${formatSalary(topMatch.salary)}`}
          </p>
          {topMatch.fit && topMatch.fit.matchedSkills.length > 0 && (
            <div className="top-match-card__skills">
              <span className="muted">Your verified skills: </span>
              {topMatch.fit.matchedSkills.slice(0, 5).map((s) => (
                <span key={s} className="evidence-chip evidence-chip--skill">
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="top-match-card__action">
          <Link href={`/jobs/${topMatch.id}`} className="button button--small button--primary">
            Review Role & Prep
          </Link>
        </div>
      </div>
    </aside>
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
          {job.market.location.countryCode && <span>{job.market.location.countryCode}</span>}
          <span>{REMOTE_LABEL[job.remotePolicy]}</span>
          {job.employmentType !== 'unknown' && <span>{EMPLOYMENT_LABEL[job.employmentType]}</span>}
          {salary && <span className="job-row__salary">{salary}</span>}
        </p>
        {job.fit && (
          <p className="job-row__fit">
            <TierChip tier={job.fit.tier} />
            {job.fit.matchedSkills.length > 0 && <span>You have {listSome(job.fit.matchedSkills)}</span>}
            {job.fit.missingRequiredSkills.length > 0 && <span className="attention">Missing {listSome(job.fit.missingRequiredSkills)}</span>}
            {job.fit.immediateStartAsked && <span className="badge">Asks for an early start</span>}
          </p>
        )}
        <p className="job-row__facts">
          <StatusChip status={job.status} lastVerifiedAt={job.lastVerifiedAt} />
          <span className="muted">{job.sources.map((s) => SOURCE_LABEL[s] ?? s).join(', ')}</span>
          {job.sourceCapabilities.includes('AUTHORIZED_EMPLOYER_DIRECT') && <span className="badge">Employer-direct</span>}
          {job.sourceCapabilities.includes('USER_DRIVEN_DISCOVERY') && <span className="badge">User-added</span>}
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

function listSome(items: string[]): string {
  return items.length <= 3 ? items.join(', ') : `${items.slice(0, 3).join(', ')} +${items.length - 3}`;
}
