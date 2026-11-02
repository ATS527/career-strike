import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../api';
import { ExternalLink, Link } from '../router';
import { ErrorPanel, Loading } from './states';

export interface MarketInfo {
  code: string;
  name: string;
  flag: string;
  region: 'Europe' | 'Asia' | 'Middle East';
  tier: 'Focus market' | 'Targeted market' | 'Explore selectively';
  en: boolean;
  cities: string;
  note: string;
  statutoryPathway: string;
  officialUrl: string;
}

export const CURATED_MARKETS: MarketInfo[] = [
  {
    code: 'DE',
    name: 'Germany',
    flag: '🇩🇪',
    region: 'Europe',
    tier: 'Focus market',
    en: true,
    cities: 'Berlin · Munich · Hamburg',
    note: 'Largest EU ICT employment footprint (~2.3M specialists); assess German-language expectations and job-specific permit options.',
    statutoryPathway: 'EU Blue Card / Skilled Immigration Act (FEG)',
    officialUrl: 'https://ec.europa.eu/eurostat/web/products-eurostat-news/w/ddn-20260527-2',
  },
  {
    code: 'NL',
    name: 'Netherlands',
    flag: '🇳🇱',
    region: 'Europe',
    tier: 'Focus market',
    en: true,
    cities: 'Amsterdam · Eindhoven',
    note: 'International tech companies; employer recognition and salary conditions matter for skilled-migrant routes.',
    statutoryPathway: 'IND Highly Skilled Migrant (Kennismigrant)',
    officialUrl: 'https://ind.nl/en/residence-permits/work/highly-skilled-migrant',
  },
  {
    code: 'IE',
    name: 'Ireland',
    flag: '🇮🇪',
    region: 'Europe',
    tier: 'Focus market',
    en: true,
    cities: 'Dublin · Cork · Galway',
    note: 'English-speaking tech ecosystem; software roles appear on the Critical Skills occupations list.',
    statutoryPathway: 'DETE Critical Skills Employment Permit (CSEP)',
    officialUrl: 'https://enterprise.gov.ie/en/what-we-do/workplace-and-skills/employment-permits/employment-permit-eligibility/highly-skilled-eligible-occupations-list/critical%20skills%20occupations%20list.html',
  },
  {
    code: 'GB',
    name: 'United Kingdom',
    flag: '🇬🇧',
    region: 'Europe',
    tier: 'Focus market',
    en: true,
    cities: 'London · Manchester',
    note: 'Large English-language employment market; sponsor approval and role-specific visa requirements must be checked.',
    statutoryPathway: 'Home Office Skilled Worker Visa (Licensed Sponsor)',
    officialUrl: 'https://www.gov.uk/skilled-worker-visa',
  },
  {
    code: 'JP',
    name: 'Japan',
    flag: '🇯🇵',
    region: 'Asia',
    tier: 'Targeted market',
    en: false,
    cities: 'Tokyo · Osaka · Fukuoka',
    note: 'Major tech economy with international employers; Japanese-language expectations narrow many opportunities.',
    statutoryPathway: 'MOJ Engineer / Specialist in Humanities (技人国)',
    officialUrl: 'https://www.moj.go.jp/isa/applications/status/gijinkoku',
  },
  {
    code: 'SG',
    name: 'Singapore',
    flag: '🇸🇬',
    region: 'Asia',
    tier: 'Targeted market',
    en: true,
    cities: 'Singapore',
    note: 'Regional fintech and technology hub; Employment Pass salary and COMPASS criteria must be evaluated.',
    statutoryPathway: 'MOM Employment Pass & COMPASS Evaluation Framework',
    officialUrl: 'https://www.mom.gov.sg/passes-and-permits/employment-pass/eligibility',
  },
  {
    code: 'SE',
    name: 'Sweden',
    flag: '🇸🇪',
    region: 'Europe',
    tier: 'Targeted market',
    en: true,
    cities: 'Stockholm · Gothenburg',
    note: 'High share of ICT employment; international hiring still requires job-specific language and permit checks.',
    statutoryPathway: 'Migrationsverket Specialist Work Permit',
    officialUrl: 'https://www.migrationsverket.se',
  },
  {
    code: 'FI',
    name: 'Finland',
    flag: '🇫🇮',
    region: 'Europe',
    tier: 'Targeted market',
    en: true,
    cities: 'Helsinki · Espoo · Tampere',
    note: 'Strong ICT specialization and selected English-language jobs; permit and salary conditions vary by route.',
    statutoryPathway: 'Migri Specialist Residence Permit (Fast-track available)',
    officialUrl: 'https://migri.fi/en/specialist',
  },
  {
    code: 'PL',
    name: 'Poland',
    flag: '🇵🇱',
    region: 'Europe',
    tier: 'Targeted market',
    en: true,
    cities: 'Warsaw · Kraków · Wrocław',
    note: 'Substantial engineering and IT-services ecosystem; employment model and permit rules need review.',
    statutoryPathway: 'Voivodeship Temporary Residence and Work Permit (Jednolite zezwolenie)',
    officialUrl: 'https://www.gov.pl/web/udsc',
  },
  {
    code: 'CZ',
    name: 'Czechia',
    flag: '🇨🇿',
    region: 'Europe',
    tier: 'Targeted market',
    en: true,
    cities: 'Prague · Brno',
    note: 'Software and engineering centers; verify job language and non-EU applicant eligibility.',
    statutoryPathway: 'MVCR Employee Card (Zaměstnanecká karta)',
    officialUrl: 'https://www.mvcr.cz/mvcren',
  },
  {
    code: 'EE',
    name: 'Estonia',
    flag: '🇪🇪',
    region: 'Europe',
    tier: 'Explore selectively',
    en: true,
    cities: 'Tallinn · Tartu',
    note: 'Startup/digital-services niche; smaller overall hiring pool than major European economies.',
    statutoryPathway: 'PPA Residence Permit for ICT Specialists (Immigration quota exempt)',
    officialUrl: 'https://www.politsei.ee',
  },
  {
    code: 'HR',
    name: 'Croatia',
    flag: '🇭🇷',
    region: 'Europe',
    tier: 'Explore selectively',
    en: false,
    cities: 'Zagreb · Split',
    note: 'EURES identifies ICT shortages, but national market is smaller; digital-nomad stay is NOT a local work permit.',
    statutoryPathway: 'MUP Stay and Work Permit (Local employer authorization)',
    officialUrl: 'https://mup.gov.hr/aliens-281621/286833?big=1',
  },
  {
    code: 'TH',
    name: 'Thailand',
    flag: '🇹🇭',
    region: 'Asia',
    tier: 'Explore selectively',
    en: false,
    cities: 'Bangkok · Chiang Mai',
    note: 'Target international firms and specialist digital roles; Thai employer work requires Non-B/work permit; DTV does NOT permit work for local Thai firms.',
    statutoryPathway: 'BOI Long-Term Resident (LTR) / Non-B Work Permit',
    officialUrl: 'https://ltr.boi.go.th/page/targeted-industries.html',
  },
  {
    code: 'MY',
    name: 'Malaysia',
    flag: '🇲🇾',
    region: 'Asia',
    tier: 'Targeted market',
    en: true,
    cities: 'Kuala Lumpur · Penang',
    note: 'Regional engineering and shared-services roles; verify sponsorship and local hiring conditions.',
    statutoryPathway: 'MDEC Malaysia Digital (MD) / Employment Pass Category I/II',
    officialUrl: 'https://mdec.my',
  },
  {
    code: 'AE',
    name: 'United Arab Emirates',
    flag: '🇦🇪',
    region: 'Middle East',
    tier: 'Targeted market',
    en: true,
    cities: 'Dubai · Abu Dhabi',
    note: 'Regional finance, cloud and enterprise technology roles; employer-sponsored status varies.',
    statutoryPathway: 'MoHRE Standard Employment Visa / Green Visa for Skilled Employees',
    officialUrl: 'https://www.mohre.gov.ae',
  },
  {
    code: 'PT',
    name: 'Portugal',
    flag: '🇵🇹',
    region: 'Europe',
    tier: 'Explore selectively',
    en: true,
    cities: 'Lisbon · Porto',
    note: 'Startup and nearshore technology roles, with salary and employer sponsorship variability.',
    statutoryPathway: 'AIMA Tech Visa / Highly Qualified Activity (D3)',
    officialUrl: 'https://aima.gov.pt',
  },
];

export function Markets() {
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState<'all' | 'Europe' | 'Asia' | 'Middle East'>('all');
  const [englishOnly, setEnglishOnly] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api<{ settings: Record<string, unknown> }>('/api/settings');
      const preferred = res.settings['search.preferredCountries'];
      if (Array.isArray(preferred)) {
        setSelectedCountries(preferred.map((c) => String(c).toUpperCase()));
      }
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const toggleTarget = async (code: string) => {
    const isCurrentlySelected = selectedCountries.includes(code);
    const next = isCurrentlySelected ? selectedCountries.filter((c) => c !== code) : [...selectedCountries, code];
    setSelectedCountries(next);
    setSavingCode(code);
    try {
      await api('/api/settings/search.preferredCountries', {
        method: 'PUT',
        body: { value: next },
      });
      const market = CURATED_MARKETS.find((m) => m.code === code);
      const name = market?.name ?? code;
      setStatusMessage(isCurrentlySelected ? `Removed ${name} from target countries.` : `Added ${name} to target countries.`);
    } catch (err) {
      // Revert optimistic update
      setSelectedCountries(selectedCountries);
      setStatusMessage(err instanceof ApiError ? 'Could not save target country selection.' : 'Network error.');
    } finally {
      setSavingCode(null);
    }
  };

  const filteredMarkets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return CURATED_MARKETS.filter((m) => {
      if (region !== 'all' && m.region !== region) return false;
      if (englishOnly && !m.en) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.cities.toLowerCase().includes(q) ||
        m.note.toLowerCase().includes(q) ||
        m.statutoryPathway.toLowerCase().includes(q) ||
        m.code.toLowerCase() === q
      );
    });
  }, [search, region, englishOnly]);

  const resetFilters = () => {
    setSearch('');
    setRegion('all');
    setEnglishOnly(false);
  };

  return (
    <div className="candidate-markets-view">
      <div className="page-head" style={{ marginBottom: '1.25rem' }}>
        <p className="eyebrow">International opportunity strategy</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1>Where should you look next?</h1>
            <p className="lede" style={{ maxWidth: '75ch' }}>
              Choose countries based on relevant hiring ecosystems, language fit and eligibility—not misleading vacancy-count rankings.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button type="button" className="button button--quiet" onClick={resetFilters}>
              Reset filters
            </button>
            <Link href="/profile" className="button button--primary">
              Back to profile →
            </Link>
          </div>
        </div>
      </div>

      {error && <ErrorPanel message="Could not load your saved target countries." onRetry={() => void loadSettings()} />}
      {loading && !error && <Loading label="Loading international tech hiring markets" />}

      <section aria-labelledby="callout-heading" className="truth-callout-card" style={{ marginBottom: '1.5rem', padding: '1.15rem 1.35rem', background: 'var(--paper-raised)', border: '1px solid var(--rule)', borderRadius: 'var(--radius-lg)' }}>
        <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start' }}>
          <span style={{ fontSize: '1.6rem', lineHeight: 1 }} aria-hidden="true">
            🌐
          </span>
          <div>
            <strong id="callout-heading" style={{ display: 'block', fontSize: '1rem', marginBottom: '0.25rem' }}>
              Exploration guide, not live job listings
            </strong>
            <p style={{ margin: 0, fontSize: '0.92rem', color: 'var(--ink-soft)', lineHeight: 1.5 }}>
              Market tiers are qualitative product hypotheses based on addressable ICT employment footprints and international mobility pathways.
              No live vacancies, employer sponsorship decisions, or visa approvals are guaranteed. Individual job postings require confirmed candidate evidence and employer sponsorship verification.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="discover-markets-title" className="markets-explorer-panel" style={{ background: 'var(--paper-raised)', border: '1px solid var(--rule)', borderRadius: 'var(--radius-lg)', padding: '1.35rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
          <div>
            <h2 id="discover-markets-title" style={{ margin: 0, fontSize: '1.2rem' }}>
              Discover international tech markets
            </h2>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.9rem', color: 'var(--ink-soft)' }}>
              Filter by region, language accessibility, and hiring hubs. Selections update your search preferences immediately.
            </p>
          </div>
          <span className="badge" style={{ fontSize: '0.85rem' }}>
            {filteredMarkets.length} market{filteredMarkets.length === 1 ? '' : 's'} available ({selectedCountries.length} selected)
          </span>
        </div>

        <div className="markets-toolbar" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1.5rem' }}>
          <input
            type="search"
            aria-label="Search countries or cities"
            placeholder="Search country, city, or visa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ minWidth: '240px', flex: '1 1 auto', padding: '0.55rem 0.85rem', borderRadius: 'var(--radius)', border: '1px solid var(--rule)', background: 'var(--paper)', color: 'var(--ink)' }}
          />
          <select
            aria-label="Filter by region"
            value={region}
            onChange={(e) => setRegion(e.target.value as typeof region)}
            style={{ padding: '0.55rem 0.85rem', borderRadius: 'var(--radius)', border: '1px solid var(--rule)', background: 'var(--paper)', color: 'var(--ink)' }}
          >
            <option value="all">All regions</option>
            <option value="Europe">Europe</option>
            <option value="Asia">Asia</option>
            <option value="Middle East">Middle East</option>
          </select>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.9rem', cursor: 'pointer', padding: '0.5rem 0.75rem', background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 'var(--radius)' }}>
            <input
              type="checkbox"
              checked={englishOnly}
              onChange={(e) => setEnglishOnly(e.target.checked)}
            />
            <span>More English-friendly pathways</span>
          </label>
        </div>

        {statusMessage && (
          <p role="status" aria-live="polite" className="save-status" style={{ marginBottom: '1rem' }}>
            {statusMessage}
          </p>
        )}

        {filteredMarkets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--ink-soft)' }}>
            <p style={{ fontSize: '1.1rem', margin: '0 0 0.5rem' }}>No countries match your current filters.</p>
            <button type="button" className="button button--quiet" onClick={resetFilters}>
              Clear filters
            </button>
          </div>
        ) : (
          <div
            className="market-cards-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '1.15rem',
            }}
          >
            {filteredMarkets.map((m) => {
              const isSelected = selectedCountries.includes(m.code);
              const isSaving = savingCode === m.code;
              return (
                <article
                  key={m.code}
                  aria-labelledby={`market-title-${m.code}`}
                  style={{
                    background: 'var(--paper)',
                    border: isSelected ? '2px solid var(--accent)' : '1px solid var(--rule)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '1.15rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                    boxShadow: isSelected ? 'var(--shadow-2)' : 'none',
                    transition: 'border-color var(--t-fast) var(--ease), box-shadow var(--t-fast) var(--ease)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ fontSize: '1.75rem', lineHeight: 1 }} aria-hidden="true">
                        {m.flag}
                      </span>
                      <div>
                        <h3 id={`market-title-${m.code}`} style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>
                          {m.name}
                        </h3>
                        <span style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>{m.cities}</span>
                      </div>
                    </div>
                    <span
                      className="badge"
                      style={{
                        fontSize: '0.75rem',
                        background:
                          m.tier === 'Focus market'
                            ? 'var(--ok-wash)'
                            : m.tier === 'Targeted market'
                              ? 'var(--accent-wash)'
                              : 'var(--paper-raised)',
                        color:
                          m.tier === 'Focus market'
                            ? 'var(--ok)'
                            : m.tier === 'Targeted market'
                              ? 'var(--accent)'
                              : 'var(--ink-soft)',
                      }}
                    >
                      {m.tier}
                    </span>
                  </div>

                  <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--ink)', lineHeight: 1.5, flex: '1 0 auto' }}>
                    {m.note}
                  </p>

                  <div style={{ fontSize: '0.8rem', padding: '0.55rem 0.65rem', background: 'var(--paper-raised)', borderRadius: 'var(--radius)', border: '1px solid var(--rule)' }}>
                    <strong style={{ display: 'block', color: 'var(--ink)', marginBottom: '0.15rem' }}>Legal pathway:</strong>
                    <span style={{ color: 'var(--ink-soft)' }}>{m.statutoryPathway}</span>
                    <div style={{ marginTop: '0.35rem', fontSize: '0.78rem' }}>
                      <ExternalLink href={m.officialUrl} className="external-link">
                        Official authority source ↗
                      </ExternalLink>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '0.4rem', borderTop: '1px solid var(--rule)' }}>
                    <span style={{ fontSize: '0.8rem', color: m.en ? 'var(--ok)' : 'var(--attention)', fontWeight: 500 }}>
                      {m.en ? '✓ English pathways exist' : '⚠ Language may limit roles'}
                    </span>
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      disabled={isSaving}
                      onClick={() => void toggleTarget(m.code)}
                      className={isSelected ? 'button button--primary' : 'button'}
                      style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                    >
                      {isSelected ? '✓ Selected' : '+ Target'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <p style={{ margin: '1.5rem 0 0', fontSize: '0.82rem', color: 'var(--ink-faint)', lineHeight: 1.5 }}>
          Priority is an editorial starting point for an international software candidate, not a numerical ranking of current vacancies.
          Country eligibility requires individual job and candidate evidence.
        </p>
      </section>
    </div>
  );
}
