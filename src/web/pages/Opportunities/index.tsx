import { type FormEvent, useEffect, useState } from 'react';
import { AUSTRALIA_SOURCE_ASSESSMENTS, officialAustraliaSearchUrl } from '../../../markets/australia-sources';
import { CANADA_SOURCE_ASSESSMENTS, officialCanadaSearchUrl } from '../../../markets/canada-sources';
import { COUNTRY_CODES, COUNTRY_REGISTRY } from '../../../markets/countries';
import { GERMANY_SOURCE_ASSESSMENTS, officialGermanySearchUrl } from '../../../markets/germany-sources';
import { INDIA_SOURCE_ASSESSMENTS, officialIndiaSearchUrl } from '../../../markets/india-sources';
import { JAPAN_SOURCE_ASSESSMENTS, officialJapanSearchUrl } from '../../../markets/japan-sources';
import { officialSingaporeSearchUrl, SINGAPORE_SOURCE_ASSESSMENTS } from '../../../markets/singapore-sources';
import { officialUaeSearchUrl, UAE_SOURCE_ASSESSMENTS } from '../../../markets/uae-sources';
import { officialUkSearchUrl, UK_SOURCE_ASSESSMENTS } from '../../../markets/uk-sources';
import { api, type Disposition, type JobList, type JobSummary, type SettingsResponse } from '../../api';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/button';
import { Link, useNavigateTo, useSearch } from '../../router';
import { useResource } from '../../useResource';
import { ErrorPanel, Loading } from '../states';
import { CountryFocusViews, OfficialSearches } from './-components/CountryFocusViews';
import { JobRow } from './-components/JobRow';
import { TopMatchSpotlight } from './-components/TopMatchSpotlight';

const PAGE = 50;
const MAX_COMPARE = 4;
const COUNTRY_FILTERS: readonly (readonly [string, string])[] = [
  ['', 'All markets'],
  ...COUNTRY_CODES.map((code) => [code, COUNTRY_REGISTRY[code].name] as const),
];

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
  const [list, setList] = useState<{ state: 'loading' } | { state: 'error' } | { state: 'ready'; data: JobList }>({
    state: 'loading',
  });
  const [limit, setLimit] = useState(PAGE);
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [compare, setCompare] = useState<string[]>([]);
  const [reload, setReload] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 761px)').matches : true,
  );

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
    if (value) p.set(key, value);
    else p.delete(key);
    navigate(`/opportunities?${p.toString()}`, { replace: true });
  };

  const submitQuery = (e: FormEvent): void => {
    e.preventDefault();
    update('q', query.trim());
  };

  const handleDisposition = async (jobId: string, disposition: Disposition): Promise<void> => {
    await api(`/api/jobs/${jobId}/disposition`, { method: 'PUT', body: { disposition } });
    setReload((r) => r + 1);
  };

  const toggleCompare = (id: string): void => {
    setCompare((curr) =>
      curr.includes(id) ? curr.filter((x) => x !== id) : curr.length < MAX_COMPARE ? [...curr, id] : curr,
    );
  };

  const countries =
    settings.state === 'ready' ? configuredCountries(settings.data.settings['search.preferredCountries']) : [];
  const selectedCountry = params.get('country') ?? '';
  const filtered = activeFilters > 0 || Boolean(params.get('q'));

  return (
    <>
      <PageHeader
        eyebrow="Market discovery"
        title="Opportunities"
        lede="Roles found on employer job boards, matched against your verified experience."
        actions={
          <div className="flex gap-2">
            <Link href="/opportunities/new" className="button button--secondary text-xs">
              + Add a job
            </Link>
            <Link href="/opportunities/sources" className="button button--quiet text-xs">
              Job boards
            </Link>
          </div>
        }
      />

      <CountryFocusViews countries={countries} />

      <form className="search-bar my-4 flex gap-2" role="search" onSubmit={submitQuery}>
        <input
          type="search"
          placeholder="Search by title, employer or skill…"
          aria-label="Search opportunities"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" size="sm">
          Search
        </Button>
      </form>

      <div className="filters-bar my-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="filters-toggle"
          aria-expanded={filtersOpen}
          aria-controls="filters-content"
          onClick={() => setFiltersOpen((o) => !o)}
        >
          {filtersOpen ? 'Hide filters' : `Filters${activeFilters > 0 ? ` (${activeFilters})` : ''}`}
        </Button>
        <div id="filters-content" className={`filters ${filtersOpen ? '' : 'filters--collapsed'}`}>
          {(Object.keys(FILTERS) as FilterKey[]).map((k) => (
            <div key={k} className="field field--inline">
              <label htmlFor={`filter-${k}`} className="field__label">
                {filterLabel(k)}
              </label>
              <select id={`filter-${k}`} value={params.get(k) ?? ''} onChange={(e) => update(k, e.target.value)}>
                {FILTERS[k].map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <div className="field field--inline">
            <label className="choice">
              <input
                type="checkbox"
                checked={params.get('immediateStart') === '1'}
                onChange={(e) => update('immediateStart', e.target.checked ? '1' : '')}
              />
              <span>Immediate start</span>
            </label>
          </div>
          <div className="field field--inline">
            <label className="choice">
              <input
                type="checkbox"
                checked={params.get('includeExcludedEmployers') === '1'}
                onChange={(e) => update('includeExcludedEmployers', e.target.checked ? '1' : '')}
              />
              <span>Include excluded employers</span>
            </label>
          </div>
          {filtered && (
            <Link href="/opportunities" className="button button--quiet text-xs">
              Reset
            </Link>
          )}
        </div>
      </div>

      {list.state === 'loading' && <Loading label="Loading opportunities" />}
      {list.state === 'error' && (
        <ErrorPanel message="Opportunities could not be loaded." onRetry={() => setReload((r) => r + 1)} />
      )}
      {list.state === 'ready' && (
        <>
          <TopMatchSpotlight jobs={list.data.jobs} />
          {list.data.jobs.length === 0 ? (
            <EmptyHint filtered={filtered} />
          ) : (
            <>
              <p className="results-count" aria-live="polite">
                Showing {list.data.jobs.length} of {list.data.total}{' '}
                {list.data.total === 1 ? 'opportunity' : 'opportunities'}
              </p>
              <ul className="job-list space-y-3">
                {list.data.jobs.map((job) => (
                  <JobRow
                    key={job.id}
                    job={job}
                    selected={compare.includes(job.id)}
                    compareFull={compare.length >= MAX_COMPARE}
                    onCompare={() => toggleCompare(job.id)}
                    onDisposition={(d) => void handleDisposition(job.id, d)}
                  />
                ))}
              </ul>
              {list.data.jobs.length < list.data.total && (
                <div className="load-more my-4 text-center">
                  <Button type="button" variant="outline" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
                    Load more opportunities
                  </Button>
                </div>
              )}
            </>
          )}
          {compare.length > 0 && (
            <aside
              className="compare-bar fixed bottom-4 right-4 z-40 p-4 bg-card border border-border rounded-xl shadow-lg flex items-center gap-4"
              aria-label="Comparison dock"
            >
              <span>
                {compare.length} of {MAX_COMPARE} selected
              </span>
              <div className="flex gap-2">
                <Link
                  href={`/opportunities/compare?id=${compare.map(encodeURIComponent).join('&id=')}`}
                  className="button button--small button--primary"
                >
                  Compare {compare.length} roles →
                </Link>
                <Button type="button" variant="ghost" size="sm" onClick={() => setCompare([])}>
                  Clear
                </Button>
              </div>
            </aside>
          )}
          {selectedCountry === 'JP' && (
            <OfficialSearches
              id="jp-official"
              market="Japan"
              sources={JAPAN_SOURCE_ASSESSMENTS}
              urlFor={officialJapanSearchUrl}
              query={query}
            />
          )}
          {selectedCountry === 'SG' && (
            <OfficialSearches
              id="sg-official"
              market="Singapore"
              sources={SINGAPORE_SOURCE_ASSESSMENTS}
              urlFor={officialSingaporeSearchUrl}
              query={query}
            />
          )}
          {selectedCountry === 'AE' && (
            <OfficialSearches
              id="ae-official"
              market="UAE"
              sources={UAE_SOURCE_ASSESSMENTS}
              urlFor={officialUaeSearchUrl}
              query={query}
            />
          )}
          {selectedCountry === 'IN' && (
            <OfficialSearches
              id="in-official"
              market="India"
              sources={INDIA_SOURCE_ASSESSMENTS}
              urlFor={officialIndiaSearchUrl}
              query={query}
            />
          )}
          {selectedCountry === 'DE' && (
            <OfficialSearches
              id="de-official"
              market="Germany"
              sources={GERMANY_SOURCE_ASSESSMENTS}
              urlFor={officialGermanySearchUrl}
              query={query}
            />
          )}
          {selectedCountry === 'GB' && (
            <OfficialSearches
              id="gb-official"
              market="United Kingdom"
              sources={UK_SOURCE_ASSESSMENTS}
              urlFor={officialUkSearchUrl}
              query={query}
            />
          )}
          {selectedCountry === 'AU' && (
            <OfficialSearches
              id="au-official"
              market="Australia"
              sources={AUSTRALIA_SOURCE_ASSESSMENTS}
              urlFor={officialAustraliaSearchUrl}
              query={query}
            />
          )}
          {selectedCountry === 'CA' && (
            <OfficialSearches
              id="ca-official"
              market="Canada"
              sources={CANADA_SOURCE_ASSESSMENTS}
              urlFor={officialCanadaSearchUrl}
              query={query}
            />
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

function filterLabel(key: FilterKey): string {
  return {
    status: 'Status',
    disposition: 'Your decision',
    remote: 'Arrangement',
    country: 'Market',
    source: 'Source',
    tier: 'Fit',
    sort: 'Sort',
  }[key];
}

function EmptyHint({ filtered }: { filtered: boolean }) {
  if (filtered) return <p className="empty">Try clearing a filter or searching for something broader.</p>;
  return (
    <p className="empty">
      Nothing here yet. <Link href="/opportunities/sources">Monitor a job board</Link> or{' '}
      <Link href="/opportunities/new">add a job you found</Link>.
    </p>
  );
}

export default Opportunities;
