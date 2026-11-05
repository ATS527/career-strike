import { COUNTRY_REGISTRY } from '../../../../markets/countries';
import { Link } from '../../../router';

export function CountryFocusViews({ countries }: { countries: string[] }) {
  if (countries.length === 0) return null;
  return (
    <nav className="country-focus" aria-label="Your country views">
      <span className="country-focus__label">Your markets</span>
      {countries.map((code) => (
        <Link
          key={code}
          href={`/opportunities?country=${encodeURIComponent(code)}&sort=best_fit`}
          className="country-focus__link"
        >
          {COUNTRY_REGISTRY[code as keyof typeof COUNTRY_REGISTRY].name} best matches
        </Link>
      ))}
      <Link href="/settings" className="country-focus__link country-focus__link--quiet">
        Edit markets
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
    <section className="external-discovery" aria-labelledby={id}>
      <div>
        <p className="eyebrow">{market} · user-driven discovery</p>
        <h2 id={id}>Search official job sites</h2>
        <p>
          These links open each provider’s own site. Career Strike does not retrieve, store or claim the listings as
          verified. After checking the employer’s official posting, <Link href="/opportunities/new">add it here</Link>{' '}
          to track it locally.
        </p>
      </div>
      <ul className="external-discovery__list">
        {sources.map((source) => (
          <li key={source.id}>
            <a href={urlFor(source, query)} target="_blank" rel="noopener noreferrer">
              {source.name} <span aria-hidden="true">↗</span>
            </a>
            <span>
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
