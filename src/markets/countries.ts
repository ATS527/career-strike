/**
 * Supported-market metadata. A configured market is not a promise that Career Strike can
 * automatically retrieve jobs there; source capability and successful verification decide that.
 */
export const COUNTRY_CODES = ['DE', 'IN', 'SG', 'MY', 'ID', 'PH', 'TH', 'VN', 'AE'] as const;
export type CountryCode = (typeof COUNTRY_CODES)[number];

export type MarketStatus = 'CONFIGURED' | 'LIMITED_SUPPORT' | 'DISCOVERY_AVAILABLE' | 'PRODUCTION_SUPPORTED' | 'BLOCKED';

export interface CountryConfig {
  code: CountryCode;
  name: string;
  currencies: readonly string[];
  locales: readonly string[];
  defaultCities: readonly string[];
  /** Additional spellings accepted only for location normalisation. */
  cityAliases: Readonly<Record<string, string>>;
  status: MarketStatus;
}

export const COUNTRY_REGISTRY: Readonly<Record<CountryCode, CountryConfig>> = {
  DE: {
    code: 'DE', name: 'Germany', currencies: ['EUR'], locales: ['de', 'en'],
    defaultCities: ['Berlin', 'Munich', 'Hamburg', 'Frankfurt', 'Cologne'],
    cityAliases: { München: 'Munich', Köln: 'Cologne' }, status: 'CONFIGURED',
  },
  IN: {
    code: 'IN', name: 'India', currencies: ['INR'], locales: ['en', 'hi'],
    defaultCities: ['Bengaluru', 'Hyderabad', 'Pune', 'Chennai', 'Delhi NCR', 'Mumbai', 'Kochi', 'Coimbatore'],
    cityAliases: { Bangalore: 'Bengaluru', Gurgaon: 'Gurugram' }, status: 'CONFIGURED',
  },
  SG: { code: 'SG', name: 'Singapore', currencies: ['SGD'], locales: ['en', 'ms', 'zh', 'ta'], defaultCities: ['Singapore'], cityAliases: {}, status: 'CONFIGURED' },
  MY: { code: 'MY', name: 'Malaysia', currencies: ['MYR'], locales: ['ms', 'en', 'zh', 'ta'], defaultCities: ['Kuala Lumpur', 'Penang', 'Johor Bahru'], cityAliases: {}, status: 'CONFIGURED' },
  ID: { code: 'ID', name: 'Indonesia', currencies: ['IDR'], locales: ['id', 'en'], defaultCities: ['Jakarta', 'Bandung', 'Surabaya', 'Yogyakarta'], cityAliases: {}, status: 'CONFIGURED' },
  PH: { code: 'PH', name: 'Philippines', currencies: ['PHP'], locales: ['en', 'fil'], defaultCities: ['Manila', 'Cebu', 'Davao'], cityAliases: {}, status: 'CONFIGURED' },
  TH: { code: 'TH', name: 'Thailand', currencies: ['THB'], locales: ['th', 'en'], defaultCities: ['Bangkok', 'Chiang Mai'], cityAliases: {}, status: 'CONFIGURED' },
  VN: { code: 'VN', name: 'Vietnam', currencies: ['VND'], locales: ['vi', 'en'], defaultCities: ['Ho Chi Minh City', 'Hanoi', 'Da Nang'], cityAliases: { 'Hồ Chí Minh City': 'Ho Chi Minh City', 'Saigon': 'Ho Chi Minh City' }, status: 'CONFIGURED' },
  AE: {
    code: 'AE', name: 'United Arab Emirates', currencies: ['AED'], locales: ['ar', 'en'],
    defaultCities: ['Dubai', 'Abu Dhabi', 'Sharjah'],
    cityAliases: {}, status: 'CONFIGURED',
  },
};

export function isCountryCode(value: string): value is CountryCode {
  return (COUNTRY_CODES as readonly string[]).includes(value);
}

const normalise = (value: string): string => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** A deterministic best-effort location parse. Missing facts stay null rather than being guessed. */
export function normaliseLocation(originalText: string | null): { countryCode: CountryCode | null; city: string | null; originalText: string | null } {
  if (!originalText) return { countryCode: null, city: null, originalText: null };
  const text = normalise(originalText);
  for (const country of Object.values(COUNTRY_REGISTRY)) {
    if (text.includes(normalise(country.name))) return { countryCode: country.code, city: cityIn(country, text), originalText };
    const city = cityIn(country, text);
    if (city) return { countryCode: country.code, city, originalText };
  }
  return { countryCode: null, city: null, originalText };
}

function cityIn(country: CountryConfig, text: string): string | null {
  for (const city of country.defaultCities) if (text.includes(normalise(city))) return city;
  for (const [alias, city] of Object.entries(country.cityAliases)) if (text.includes(normalise(alias))) return city;
  return null;
}
