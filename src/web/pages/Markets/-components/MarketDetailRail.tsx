import { Badge } from '../../../components/ui/badge';
import { Button, buttonVariants } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { cn } from '../../../helpers/cn';
import { ExternalLink, Link } from '../../../router';
import type { MarketInfo } from '../-helpers/curatedMarkets';

interface MarketDetailRailProps {
  activeMarket: MarketInfo;
  isSelected: boolean;
  isSaving: boolean;
  onToggleTarget: (code: string) => void;
}

export function MarketDetailRail({ activeMarket, isSelected, isSaving, onToggleTarget }: MarketDetailRailProps) {
  return (
    <aside
      className="rounded-lg border border-border bg-card p-5 space-y-4 shadow-xs flex flex-col justify-between"
      aria-labelledby="active-market-intel-title"
    >
      <div className="flex justify-between items-start border-b border-border pb-3.5">
        <div className="flex items-center gap-3">
          <span className="text-4xl leading-none" aria-hidden="true">
            {activeMarket.flag}
          </span>
          <div>
            <h3 id="active-market-intel-title" className="text-xl font-bold font-serif text-foreground m-0">
              {activeMarket.name}
            </h3>
            <span className="text-xs text-muted-foreground">{activeMarket.cities}</span>
          </div>
        </div>
        <Badge variant="teal">{activeMarket.tier}</Badge>
      </div>

      <div className="space-y-1">
        <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block">
          Ecosystem Footprint
        </span>
        <p className="text-xs text-foreground leading-relaxed m-0">{activeMarket.ecosystemNote}</p>
      </div>

      <div className="space-y-1">
        <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block">
          Language Expectations
        </span>
        <p className="text-xs text-foreground leading-relaxed m-0">{activeMarket.languageNote}</p>
      </div>

      <Card className="bg-muted/30 border-border">
        <CardContent className="p-3.5 space-y-1.5">
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold block">
            Legal Pathway & Statutory Route
          </span>
          <strong className="text-sm font-semibold text-foreground block">{activeMarket.statutoryPathway}</strong>
          <p className="text-xs text-muted-foreground leading-relaxed m-0">{activeMarket.note}</p>
          <div className="pt-1">
            <ExternalLink href={activeMarket.officialUrl} className="text-xs text-primary hover:underline">
              Official statutory guidance ↗
            </ExternalLink>
          </div>
        </CardContent>
      </Card>

      <div className="pt-3 border-t border-border flex flex-col gap-2 mt-auto">
        <Button
          type="button"
          variant={isSelected ? 'default' : 'secondary'}
          disabled={isSaving}
          onClick={() => onToggleTarget(activeMarket.code)}
          className="w-full justify-center"
        >
          {isSelected ? `✓ ${activeMarket.name} is in your targets` : `+ Target ${activeMarket.name}`}
        </Button>
        <Link
          href={`/opportunities?market=${activeMarket.code}`}
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'w-full text-center text-xs')}
        >
          Explore vacancies in {activeMarket.name} →
        </Link>
      </div>
    </aside>
  );
}

export default MarketDetailRail;
