import { COUNTRY_REGISTRY } from '../../../../markets/countries';
import { Link } from '../../../router';

export function CountryFocusViews({ countries }: { countries: string[] }) {
  if (countries.length === 0) return null;
  return (
    <nav
      className="flex items-center gap-2 flex-wrap p-2.5 rounded-lg border border-border bg-card shadow-xs text-xs mb-6"
      aria-label="Your country views"
    >
      <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[11px] mr-1">
        Your markets:
      </span>
      {countries.map((code) => (
        <Link
          key={code}
          href={`/opportunities?country=${encodeURIComponent(code)}&sort=best_fit`}
          className="px-2.5 py-1 rounded bg-muted/50 border border-border text-foreground hover:bg-muted transition-colors font-medium"
        >
          {COUNTRY_REGISTRY[code as keyof typeof COUNTRY_REGISTRY]?.name ?? code} best matches
        </Link>
      ))}
      <Link href="/settings" className="text-primary hover:underline ml-auto font-medium">
        Edit markets →
      </Link>
    </nav>
  );
}

export function OfficialSearches<M extends { id: string; name: string; capability: string }>({
  id,
  market,
  sources,
  urlFor,
  query,
}: {
  id: string;
  market: string;
  sources: readonly M[];
  urlFor: (source: M, query: string) => string;
  query: string;
}) {
  return (
    <section className="p-5 rounded-lg border border-border bg-card shadow-xs space-y-4 my-6" aria-labelledby={id}>
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground m-0">
          {market} · user-driven discovery
        </p>
        <h2 id={id} className="text-lg font-bold text-foreground m-0">
          Search official job sites
        </h2>
        <p className="text-xs text-muted-foreground leading-relaxed m-0">
          These links open each provider’s own site. Career Strike does not retrieve, store or claim the listings as
          verified. After checking the employer’s official posting,{' '}
          <Link href="/opportunities/new" className="text-primary hover:underline">
            add it here
          </Link>{' '}
          to track it locally.
        </p>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-0 m-0 list-none">
        {sources.map((source) => (
          <li key={source.id} className="p-3 rounded-lg border border-border bg-muted/20 space-y-1">
            <a
              href={urlFor(source, query)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-primary hover:underline text-sm inline-flex items-center gap-1"
            >
              {source.name} <span aria-hidden="true">↗</span>
            </a>
            <span className="block text-xs text-muted-foreground">
              {source.capability === 'USER_DRIVEN_DISCOVERY'
                ? 'Search on the official site'
                : source.capability === 'RESTRICTED'
                  ? 'Official site only — no automation'
                  : 'No automatic retrieval'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
