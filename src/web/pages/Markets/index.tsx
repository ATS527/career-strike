import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '../../api';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/button';
import { Link } from '../../router';
import { ErrorPanel, Loading } from '../states';
import { MarketDetailRail } from './-components/MarketDetailRail';
import { MarketFilters } from './-components/MarketFilters';
import { MarketTable } from './-components/MarketTable';
import { CURATED_MARKETS, type MarketInfo } from './-helpers/curatedMarkets';

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
      setStatusMessage(
        isCurrentlySelected ? `Removed ${name} from target markets.` : `Added ${name} to target markets.`,
      );
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
      <PageHeader
        eyebrow="International opportunity strategy"
        title="Where should you look next?"
        lede="Research software hiring ecosystems, legal mobility pathways, and language realities—not misleading vacancy-count rankings."
        actions={
          <div className="flex gap-2 items-center flex-wrap">
            <Button type="button" variant="ghost" onClick={resetFilters}>
              Reset filters
            </Button>
            <Link href="/profile" className="button button--primary">
              Back to profile →
            </Link>
          </div>
        }
      />

      {error && (
        <ErrorPanel message="Could not load your saved target countries." onRetry={() => void loadSettings()} />
      )}
      {loading && !error && <Loading label="Loading international tech hiring markets" />}

      {/* Truth-in-Advertising Callout */}
      <section aria-labelledby="callout-heading" className="mb-6 p-4 bg-card border border-border rounded-lg shadow-xs">
        <div className="flex gap-3 items-start">
          <span className="text-2xl leading-none" aria-hidden="true">
            🌐
          </span>
          <div>
            <strong id="callout-heading" className="block text-sm font-semibold mb-1 text-foreground">
              Research workspace, not live job listings
            </strong>
            <p className="m-0 text-xs text-muted-foreground leading-relaxed">
              Market tiers represent addressable ICT employment footprints and international mobility pathways. No live
              vacancies, employer sponsorship decisions, or visa approvals are guaranteed. Individual job postings
              require confirmed candidate evidence and employer sponsorship verification.
            </p>
          </div>
        </div>
      </section>

      {statusMessage && (
        <p role="status" aria-live="polite" className="save-status mb-4">
          {statusMessage}
        </p>
      )}

      {/* 3-Column Editorial Research Workspace */}
      <div className="market-research-workspace">
        <MarketFilters
          search={search}
          onSearchChange={setSearch}
          region={region}
          onRegionChange={setRegion}
          englishOnly={englishOnly}
          onEnglishOnlyChange={setEnglishOnly}
          selectedCountries={selectedCountries}
          onSelectCountry={setActiveMarketCode}
          onToggleTarget={toggleTarget}
        />

        <MarketTable
          markets={filteredMarkets}
          selectedCountries={selectedCountries}
          activeMarketCode={activeMarketCode}
          savingCode={savingCode}
          onSelectMarket={setActiveMarketCode}
          onToggleTarget={toggleTarget}
          onResetFilters={resetFilters}
        />

        <MarketDetailRail
          activeMarket={activeMarket}
          isSelected={selectedCountries.includes(activeMarket.code)}
          isSaving={savingCode === activeMarket.code}
          onToggleTarget={toggleTarget}
        />
      </div>
    </div>
  );
}

export { CURATED_MARKETS, type MarketInfo } from './-helpers/curatedMarkets';
export default Markets;
