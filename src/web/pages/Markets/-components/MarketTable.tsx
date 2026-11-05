import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import type { MarketInfo } from '../-helpers/curatedMarkets';

interface MarketTableProps {
  markets: MarketInfo[];
  selectedCountries: string[];
  activeMarketCode: string;
  savingCode: string | null;
  onSelectMarket: (code: string) => void;
  onToggleTarget: (code: string) => void;
  onResetFilters: () => void;
}

export function MarketTable({
  markets,
  selectedCountries,
  activeMarketCode,
  savingCode,
  onSelectMarket,
  onToggleTarget,
  onResetFilters,
}: MarketTableProps) {
  return (
    <section
      aria-labelledby="comparison-matrix-heading"
      className="market-comparison-table-wrapper rounded-lg border border-border bg-card shadow-xs overflow-hidden"
    >
      <div className="p-4 border-b border-border flex justify-between items-center bg-card">
        <div>
          <h2 id="comparison-matrix-heading" className="text-base font-semibold m-0 text-foreground">
            Discover international tech markets
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Click any market row to review detailed visa pathways and language expectations.
          </p>
        </div>
        <Badge variant="secondary">
          {markets.length} market{markets.length === 1 ? '' : 's'}
        </Badge>
      </div>

      {markets.length === 0 ? (
        <div className="p-12 text-center text-muted-foreground">
          <p className="mb-2">No countries match your search filters.</p>
          <Button type="button" variant="ghost" onClick={onResetFilters}>
            Reset filters
          </Button>
        </div>
      ) : (
        <div className="market-cards-grid overflow-x-auto">
          <table className="market-table w-full text-left">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="p-3 font-medium">Market</th>
                <th className="p-3 font-medium">Ecosystem Tier</th>
                <th className="p-3 font-medium">Language</th>
                <th className="p-3 font-medium">Primary Statutory Route</th>
                <th className="p-3 font-medium text-right">Target</th>
              </tr>
            </thead>
            <tbody>
              {markets.map((m) => {
                const isSelected = selectedCountries.includes(m.code);
                const isActive = activeMarketCode === m.code;
                return (
                  <tr
                    key={m.code}
                    className={`border-b border-border/50 hover:bg-muted/40 transition-colors cursor-pointer ${
                      isActive ? 'bg-muted/60 font-medium' : ''
                    }`}
                    onClick={() => onSelectMarket(m.code)}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-2.5">
                        <span className="text-2xl leading-none" aria-hidden="true">
                          {m.flag}
                        </span>
                        <div>
                          <strong className="block text-foreground text-sm font-semibold">{m.name}</strong>
                          <span className="text-xs text-muted-foreground">{m.cities}</span>
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <Badge
                        variant={
                          m.tier === 'Focus market' ? 'teal' : m.tier === 'Targeted market' ? 'secondary' : 'outline'
                        }
                        className="text-[11px]"
                      >
                        {m.tier}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <span
                        className={`text-xs font-medium ${m.en ? 'text-teal-700 dark:text-teal-300' : 'text-amber-700 dark:text-amber-400'}`}
                      >
                        {m.en ? '✓ English-friendly' : '⚠ Local language expected'}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">{m.statutoryPathway}</td>
                    <td className="p-3 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant={isSelected ? 'default' : 'secondary'}
                        aria-pressed={isSelected}
                        disabled={savingCode === m.code}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleTarget(m.code);
                        }}
                        className="min-w-[78px] text-xs h-7"
                      >
                        {isSelected ? '✓ Selected' : '+ Target'}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
