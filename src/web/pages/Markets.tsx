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
  languageNote: string;
  ecosystemNote: string;
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
    note: 'Largest EU ICT employment footprint (~2.3M specialists in Eurostat 2025/2026); assess German-language expectations and job-specific permit options.',
    languageNote: 'English widely accepted in Berlin and Munich tech scaleups; intermediate German often required for broader enterprise roles.',
    ecosystemNote: '~2.3 million employed ICT specialists. Strong enterprise cloud, automotive tech, and platform infrastructure.',
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
    languageNote: 'High English proficiency; Dutch rarely mandated for engineering at international employers.',
    ecosystemNote: 'Major European hub for fintech, semiconductor platforms (ASML ecosystem), and multinational European headquarters.',
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
    languageNote: 'Native English-speaking market with zero language friction for international applicants.',
    ecosystemNote: 'European headquarters for global cloud, hyperscalers, and SaaS operations.',
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
    languageNote: 'Native English-speaking market. High competition in fintech and distributed systems.',
    ecosystemNote: 'Largest venture ecosystem in Europe with deep fintech, AI research, and quantitative trading clusters.',
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
    languageNote: 'English-only roles concentrate in TokyoDev-tracked international firms; JLPT N2/N1 required for standard domestic employers.',
    ecosystemNote: 'Substantial hardware/software convergence, gaming, e-commerce, and robotics sectors.',
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
    languageNote: 'English is the primary working language in corporate and engineering environments.',
    ecosystemNote: 'Premier Southeast Asian regional headquarters hub for global tech, venture, and fintech.',
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
    languageNote: 'High English fluency in tech startups; Swedish beneficial for long-term integration.',
    ecosystemNote: 'Product-led tech giants (Spotify, Klarna) and robust open-source development culture.',
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
    languageNote: 'English standard in international gaming and telecom software firms.',
    ecosystemNote: 'High per-capita software patenting, telecom infrastructure (Nokia), and mobile gaming.',
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
    languageNote: 'English standard for international development centers; Polish for local client delivery.',
    ecosystemNote: 'One of Central Europe’s largest software engineering talents bases for distributed engineering hubs.',
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
    languageNote: 'English widely used in Prague R&D centers; Czech useful for administrative interactions.',
    ecosystemNote: 'Established cybersecurity and systems engineering hubs in Prague and Brno.',
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
    languageNote: 'English is the standard language of the startup and digital governance sector.',
    ecosystemNote: 'Digital public infrastructure, e-Residency, and high unicorn density per capita.',
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
    languageNote: 'Croatian standard in local industry; English used in selected automotive and software agencies.',
    ecosystemNote: 'Growing tech cluster (Rimac, Infobip) but smaller total vacancy inventory.',
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
    languageNote: 'Thai standard for domestic companies; English required for regional and BOI-approved employers.',
    ecosystemNote: 'Regional e-commerce, digital transformation, and international engineering development centers.',
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
    languageNote: 'English widely used across corporate and engineering teams alongside Malay.',
    ecosystemNote: 'MDEC-backed digital hubs, enterprise service centers, and hardware/semiconductor design in Penang.',
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
    languageNote: 'English is the universal business and engineering language in UAE tech hubs.',
    ecosystemNote: 'Fast-growing capital for crypto/web3, sovereign AI initiatives, and MENA regional headquarters.',
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
    languageNote: 'English standard across international nearshore engineering centers in Lisbon and Porto.',
    ecosystemNote: 'Attractive European nearshore hub with active startup scene and Web Summit presence.',
    statutoryPathway: 'AIMA Tech Visa / Highly Qualified Activity (D3)',
    officialUrl: 'https://aima.gov.pt',
  },
];

export function Markets() {
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [activeMarketCode, setActiveMarketCode] = useState<string>('DE');
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState<'all' | 'Europe' | 'Asia' | 'Middle East'>('all');
  const [englishOnly, setEnglishOnly] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [discoveryByCode, setDiscoveryByCode] = useState<Record<string, boolean>>({});

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const [settingsRes, readinessRes] = await Promise.all([
        api<{ settings: Record<string, unknown> }>('/api/settings'),
        api<{ markets: { code: string; discoveryAvailable: boolean }[] }>('/api/readiness').catch(() => null),
      ]);
      const preferred = settingsRes.settings['search.preferredCountries'];
      if (Array.isArray(preferred)) {
        setSelectedCountries(preferred.map((c) => String(c).toUpperCase()));
      }
      if (readinessRes?.markets) {
        const map: Record<string, boolean> = {};
        for (const m of readinessRes.markets) map[m.code.toUpperCase()] = m.discoveryAvailable;
        setDiscoveryByCode(map);
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
      setStatusMessage(isCurrentlySelected ? `Removed ${name} from target markets.` : `Added ${name} to target markets.`);
    } catch (err) {
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

  const activeMarket = useMemo(() => {
    return CURATED_MARKETS.find((m) => m.code === activeMarketCode) ?? CURATED_MARKETS[0]!;
  }, [activeMarketCode]);

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
              Research software hiring ecosystems, legal mobility pathways, and language realities—not misleading vacancy-count rankings.
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

      {/* Truth-in-Advertising Callout */}
      <section
        aria-labelledby="callout-heading"
        style={{
          marginBottom: '1.5rem',
          padding: '1.15rem 1.35rem',
          background: 'var(--canvas)',
          border: '1px solid var(--rule)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-1)',
        }}
      >
        <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start' }}>
          <span style={{ fontSize: '1.5rem', lineHeight: 1 }} aria-hidden="true">
            🌐
          </span>
          <div>
            <strong id="callout-heading" style={{ display: 'block', fontSize: '0.98rem', marginBottom: '0.2rem' }}>
              Research workspace, not live job listings
            </strong>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--ink-soft)', lineHeight: 1.5 }}>
              Market tiers represent addressable ICT employment footprints and international mobility pathways.
              No live vacancies, employer sponsorship decisions, or visa approvals are guaranteed. Individual job postings require confirmed candidate evidence and employer sponsorship verification.
            </p>
          </div>
        </div>
      </section>

      {statusMessage && (
        <p role="status" aria-live="polite" className="save-status" style={{ marginBottom: '1rem' }}>
          {statusMessage}
        </p>
      )}

      {/* 3-Column Editorial Research Workspace */}
      <div className="market-research-workspace">
        {/* Rail 1: Filters & Saved Targets */}
        <div className="workspace-stack" style={{ gap: '1.25rem' }}>
          <section className="market-panel" aria-labelledby="filters-heading" style={{ padding: '1.25rem' }}>
            <h2 id="filters-heading" style={{ fontSize: '1.05rem', margin: '0 0 1rem' }}>
              Filters & Search
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div className="record__part">
                <label htmlFor="marketsearch-input">Search country or city</label>
                <input
                  id="marketsearch-input"
                  type="search"
                  aria-label="Search countries or cities"
                  placeholder="e.g. Japan, Berlin, Blue Card..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="record__part">
                <label htmlFor="marketregion-select">Region</label>
                <select
                  id="marketregion-select"
                  aria-label="Filter by region"
                  value={region}
                  onChange={(e) => setRegion(e.target.value as typeof region)}
                >
                  <option value="all">All regions</option>
                  <option value="Europe">Europe</option>
                  <option value="Asia">Asia</option>
                  <option value="Middle East">Middle East</option>
                </select>
              </div>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  padding: '0.5rem 0',
                }}
              >
                <input
                  type="checkbox"
                  checked={englishOnly}
                  onChange={(e) => setEnglishOnly(e.target.checked)}
                />
                <span>More English-friendly pathways</span>
              </label>
            </div>
          </section>

          <section className="market-panel" aria-labelledby="target-markets-heading" style={{ padding: '1.25rem' }}>
            <h2 id="target-markets-heading" style={{ fontSize: '1.05rem', margin: '0 0 0.75rem' }}>
              Targeted Markets ({selectedCountries.length})
            </h2>
            {selectedCountries.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--ink-soft)' }}>
                No countries targeted yet. Click <code>+ Target</code> on any country to add it to your search criteria.
              </p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {selectedCountries.map((code) => {
                  const m = CURATED_MARKETS.find((x) => x.code === code);
                  return (
                    <li
                      key={code}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.45rem 0.65rem',
                        background: 'var(--paper-subtle)',
                        borderRadius: 'var(--radius)',
                        border: '1px solid var(--rule)',
                        fontSize: '0.88rem',
                      }}
                    >
                      <button
                        type="button"
                        className="quiet"
                        style={{ textAlign: 'left', fontWeight: 600, color: 'var(--ink)' }}
                        onClick={() => setActiveMarketCode(code)}
                      >
                        {m?.flag} {m?.name ?? code}
                      </button>
                      <button
                        type="button"
                        className="quiet"
                        style={{ color: 'var(--ink-soft)', fontSize: '0.8rem' }}
                        onClick={() => void toggleTarget(code)}
                        aria-label={`Remove ${m?.name ?? code} from targets`}
                      >
                        ✕
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* Rail 2: Scannable Comparative Table */}
        <section aria-labelledby="comparison-matrix-heading" className="market-comparison-table-wrapper">
          <div style={{ padding: '1.15rem 1.25rem', borderBottom: '1px solid var(--rule)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 id="comparison-matrix-heading" style={{ margin: 0, fontSize: '1.15rem' }}>
                Discover international tech markets
              </h2>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: 'var(--ink-soft)' }}>
                Click any market row to review detailed visa pathways and language expectations.
              </p>
            </div>
            <span className="market-chip">
              {filteredMarkets.length} market{filteredMarkets.length === 1 ? '' : 's'}
            </span>
          </div>

          {filteredMarkets.length === 0 ? (
            <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: 'var(--ink-soft)' }}>
              <p style={{ margin: '0 0 0.5rem' }}>No countries match your search filters.</p>
              <button type="button" className="button button--quiet" onClick={resetFilters}>
                Reset filters
              </button>
            </div>
          ) : (
            <div className="market-cards-grid" style={{ overflowX: 'auto' }}>
              <table className="market-table">
                <thead>
                  <tr>
                    <th>Market</th>
                    <th>Ecosystem Tier</th>
                    <th>Language</th>
                    <th>Primary Statutory Route</th>
                    <th style={{ textAlign: 'right' }}>Target</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMarkets.map((m) => {
                    const isSelected = selectedCountries.includes(m.code);
                    const isActive = activeMarketCode === m.code;
                    return (
                      <tr
                        key={m.code}
                        className={isActive ? 'selected' : ''}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setActiveMarketCode(m.code)}
                      >
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                            <span style={{ fontSize: '1.4rem', lineHeight: 1 }} aria-hidden="true">
                              {m.flag}
                            </span>
                            <div>
                              <strong style={{ display: 'block', color: 'var(--ink)', fontSize: '0.92rem' }}>
                                {m.name}
                              </strong>
                              <span style={{ fontSize: '0.78rem', color: 'var(--ink-soft)' }}>{m.cities}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span
                            className="market-chip"
                            style={{
                              fontSize: '0.75rem',
                              background:
                                m.tier === 'Focus market'
                                  ? 'var(--accent-wash)'
                                  : m.tier === 'Targeted market'
                                    ? 'var(--paper-subtle)'
                                    : 'var(--canvas)',
                              color: m.tier === 'Focus market' ? 'var(--accent)' : 'var(--ink-soft)',
                            }}
                          >
                            {m.tier}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: '0.8rem', color: m.en ? 'var(--accent)' : 'var(--attention)', fontWeight: 500 }}>
                            {m.en ? '✓ English-friendly' : '⚠ Local language expected'}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>{m.statutoryPathway}</span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            aria-pressed={isSelected}
                            disabled={savingCode === m.code}
                            onClick={(e) => {
                              e.stopPropagation();
                              void toggleTarget(m.code);
                            }}
                            className={isSelected ? 'button button--primary' : 'button button--quiet'}
                            style={{ padding: '0.35rem 0.65rem', fontSize: '0.82rem', minWidth: '78px' }}
                          >
                            {isSelected ? '✓ Selected' : '+ Target'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Rail 3: Active Market Intelligence Panel */}
        <aside className="market-intelligence-panel" aria-labelledby="active-market-intel-title">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--rule)', paddingBottom: '0.85rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '2.2rem', lineHeight: 1 }} aria-hidden="true">
                {activeMarket.flag}
              </span>
              <div>
                <h3 id="active-market-intel-title" style={{ margin: 0, fontSize: '1.25rem', fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                  {activeMarket.name}
                </h3>
                <span style={{ fontSize: '0.85rem', color: 'var(--ink-soft)' }}>{activeMarket.cities}</span>
              </div>
            </div>
            <span className="market-chip evidence-chip--verified">{activeMarket.tier}</span>
          </div>

          <div>
            <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-soft)', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
              Ecosystem Footprint
            </span>
            <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--ink)', lineHeight: 1.5 }}>
              {activeMarket.ecosystemNote}
            </p>
          </div>

          <div>
            <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-soft)', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
              Language Expectations
            </span>
            <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--ink)', lineHeight: 1.5 }}>
              {activeMarket.languageNote}
            </p>
          </div>

          <div style={{ background: 'var(--paper-subtle)', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', padding: '0.85rem' }}>
            <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-soft)', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
              Legal Pathway & Statutory Route
            </span>
            <strong style={{ fontSize: '0.9rem', color: 'var(--ink)', display: 'block', marginBottom: '0.35rem' }}>
              {activeMarket.statutoryPathway}
            </strong>
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.82rem', color: 'var(--ink-soft)', lineHeight: 1.45 }}>
              {activeMarket.note}
            </p>
            <ExternalLink href={activeMarket.officialUrl} className="external-link" style={{ fontSize: '0.8rem' }}>
              Official statutory guidance ↗
            </ExternalLink>
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.76rem', color: 'var(--ink-faint)' }}>
              Official sources last reviewed: 2026-11-01. Research only; not a visa or work-eligibility decision.
            </p>
          </div>

          <div style={{ padding: '0.65rem 0.85rem', background: 'var(--paper-subtle)', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', fontSize: '0.82rem' }}>
            <strong style={{ display: 'block', color: 'var(--ink)', marginBottom: '0.2rem' }}>Discovery status</strong>
            <span style={{ color: 'var(--ink-soft)' }}>
              {discoveryByCode[activeMarket.code]
                ? 'Discovery available in this installation (verified local source).'
                : 'Configured research market only; no verified local discovery yet.'}
            </span>
          </div>

          <div style={{ marginTop: 'auto', paddingTop: '0.75rem', borderTop: '1px solid var(--rule)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <button
              type="button"
              className={selectedCountries.includes(activeMarket.code) ? 'button button--primary' : 'button'}
              disabled={savingCode === activeMarket.code}
              onClick={() => void toggleTarget(activeMarket.code)}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {selectedCountries.includes(activeMarket.code) ? `✓ ${activeMarket.name} is in your targets` : `+ Target ${activeMarket.name}`}
            </button>
            <Link
              href={`/opportunities?market=${activeMarket.code}`}
              className="button button--quiet"
              style={{ width: '100%', textAlign: 'center', fontSize: '0.85rem' }}
            >
              Explore vacancies in {activeMarket.name} →
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
