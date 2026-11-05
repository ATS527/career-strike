import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { CURATED_MARKETS } from '../-helpers/curatedMarkets';

interface MarketFiltersProps {
  search: string;
  onSearchChange: (val: string) => void;
  region: 'all' | 'Europe' | 'Asia' | 'Middle East';
  onRegionChange: (val: 'all' | 'Europe' | 'Asia' | 'Middle East') => void;
  englishOnly: boolean;
  onEnglishOnlyChange: (val: boolean) => void;
  selectedCountries: string[];
  onSelectCountry: (code: string) => void;
  onToggleTarget: (code: string) => void;
}

export function MarketFilters({
  search,
  onSearchChange,
  region,
  onRegionChange,
  englishOnly,
  onEnglishOnlyChange,
  selectedCountries,
  onSelectCountry,
  onToggleTarget,
}: MarketFiltersProps) {
  return (
    <div className="workspace-stack space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Filters & Search</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="marketsearch-input" className="text-sm font-medium">
              Search country or city
            </label>
            <Input
              id="marketsearch-input"
              type="search"
              aria-label="Search countries or cities"
              placeholder="e.g. Japan, Berlin, Blue Card..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="marketregion-select" className="text-sm font-medium">
              Region
            </label>
            <select
              id="marketregion-select"
              aria-label="Filter by region"
              value={region}
              onChange={(e) => onRegionChange(e.target.value as typeof region)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="all">All regions</option>
              <option value="Europe">Europe</option>
              <option value="Asia">Asia</option>
              <option value="Middle East">Middle East</option>
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={englishOnly}
              onChange={(e) => onEnglishOnlyChange(e.target.checked)}
              className="rounded border-input text-primary shadow-xs focus:ring-ring"
            />
            <span>More English-friendly pathways</span>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Targeted Markets ({selectedCountries.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {selectedCountries.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No countries targeted yet. Click <code>+ Target</code> on any country to add it to your search criteria.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {selectedCountries.map((code) => {
                const m = CURATED_MARKETS.find((x) => x.code === code);
                return (
                  <li
                    key={code}
                    className="flex justify-between items-center px-2 py-1.5 bg-muted/30 rounded border border-border text-sm"
                  >
                    <button
                      type="button"
                      className="font-semibold text-foreground text-left hover:underline"
                      onClick={() => onSelectCountry(code)}
                    >
                      {m?.flag} {m?.name ?? code}
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => onToggleTarget(code)}
                      aria-label={`Remove ${m?.name ?? code} from targets`}
                    >
                      ✕
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
